/**
 * GitHub and Travis integration for our multi-project repository (silk-core)
 *
 * -- Motivation --
 *
 * silk-core is home to many different parts of the Silk ecosystem
 * which have very different build requirements -- different enough
 * that they can't be expressed in a single .travis.yml configuration
 * file. Moreover, changes to only one or two projects should only
 * kick off builds for those (and dependent) projects and avoid
 * potentially costly builds of other projects.
 *
 * -- Implementation --
 *
 * 1. We get notified or PRs and pushes to silk-core. We analyze the
 *    changes identify which projects were modified and need Travis
 *    builds kicked off.
 *
 *    In case of a PR, we also create/update a branch called
 *    'pr_###_merge_ci' (where ### is the number of the PR) based on
 *    the automatic merge commit that GitHub creates for each PR. That
 *    mirrors Travis's default PR behaviour, and it gives Travis a
 *    branch to build against. This is important because Travis likes
 *    to report build status back to GitHub no matter what, and we
 *    don't want it to report the build status of PRs back to 'master'
 *    or whatever other branch the PR is against.
 *
 * 2. For each project that we need to build, we read a .travis.yml
 *    file that's in the project's corresponding subdirectory. That
 *    becomes the build's template, which we amend with environment
 *    variables, webhook config, etc. We then use the Travis API to
 *    programmatically kick off a build based on that configuration.
 *    If multiple projects are affected, we kick off a build for each
 *    one that has a .travis.yml file.
 *
 * 3. When Travis starts and completes the build(s), we get a webhook
 *    notification and subsequently update the build status on
 *    GitHub. Statuses on GitHub live at the commit level. For pushes
 *    to branches, we simply set the status on the corresponding head
 *    commit. It's slightly more complicated for PR builds: the builds
 *    are done against the merge commit, but the status needs to be
 *    reported back to the head commit of the PR.
 */

import Octokat from 'octokat';
import Travis from 'travis-ci';
import YAML from 'yamljs';
import cb2promise from 'promise-callback';
import request from 'request-promise';
import createLog from 'log';

type PullRequestEvent = Object;
type PushEvent = Object;
type TravisWebhookPayload = Object;
type Repo = Object;
type BuildOptions = {
  message: string;
  repo: string;
  owner: string;
  project: string;
  branch: string;
  sha: string;
  commitRange: string;
  pullRequest?: number;
};

if (!process.env.GITHUB_TOKEN) {
  throw new Error('GITHUB_TOKEN environment variable undefined');
}

const log = createLog('github-travis-integration');
const octokat = new Octokat({
  token: process.env.GITHUB_TOKEN,
});
const travis = new Travis({
  version: '2.0.0',
  pro: true,
});

const PR_ACTIONS_THAT_KICK_OFF_BUILDS = [
  'opened',
  'reopened',
  'synchronize',
];
const TRAVIS_WEBHOOK_URL = 'https://silk-releng.herokuapp.com/hooks/travis';

const TRAVIS_TO_GITHUB_BUILD_STATES = {
  started: 'pending',
  pending: 'pending',
  passed: 'success',
  failed: 'failure',
  broken: 'error',
  fixed: 'success',
  failing: 'failure',
  errored: 'error',
  canceled: 'error',
};

const MAX_PR_MERGEABLE_RETRIES = 3;
const PR_MERGEABLE_TIMEOUT_MS = 250;

const PR_BRANCH_REGEX = /pr_([0-9]+)_merge_ci/;
const PROJECT_IN_BUILD_MSG_REGEX = /\[([a-zA-Z0-9._-]+)\] .*/;

/**
 * Awaitable version of `setTimeout`.
 */
function timeout(delay_ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delay_ms));
}

/**
 * Add the top level directory of `filename` to the `projects` set.
 * This most useful when applied against every path in a list of paths
 * involved in one or more commits..
 */
function populateProjectsFromFilename(projects: Set<string>, filename: string) {
  if (filename.indexOf('/') === -1) {
    return;
  }
  let project = filename.split('/')[0];
  projects.add(project);
}

/**
 * Determine which top level directories ("projects") were affected by
 * a given single commit.
 */
async function determineProjectsToBuildForCommit(
  repo: Repo,
  sha: string
): Promise<Array<string>> {
  let unique_projects = new Set();
  let commit = await repo.commits(sha).fetch();
  commit.files.forEach((file) => populateProjectsFromFilename(unique_projects, file.filename));
  let projects = [...unique_projects];
  log.info(`Projects touched by commit ${sha}: ${projects}`);
  return projects;
}

/**
 * Read the contents of a file at a given commit.
 */
async function readFileAtCommit(
  repo: Repo,
  filename: string,
  commit: string
): Promise<?string> {
  let contents = null;
  try {
    contents = await repo.contents(filename).read({ref: commit});
    log.info(`Read ${filename} at commit ${commit}`);
  } catch(ex) {
    log.info(`Could not read ${filename} at commit ${commit}`);
  }
  return contents;
}

/**
 * Create a branch called `branch` off the given commit. The branch
 * will be force-updated if it already exists.
 */
async function createOrUpdateBranch(
  repo: Repo,
  branch: string,
  sha: string
): Promise<void> {
  let ref = null;
  try {
    ref = await repo.git.refs.heads(branch).fetch();
  } catch (err) { // eslint-disable-line no-empty
    // Ignore.
  }

  if (!ref) {
    log.info(`Branch ${branch} doesn\'t exist yet, creating it...`);
    await repo.git.refs.create({
      ref: 'refs/heads/' + branch,
      sha,
    });
    return;
  }
  if (ref.object.sha !== sha) {
    log.info(`Branch ${branch} exist, but is at ${ref.object.sha}, updating...`);
    await repo.git.refs.heads(branch).update({
      sha,
      force: true,
    });
    return;
  }
  log.info(`Branch ${branch} up-to-date.`);
}

async function deleteBranch(repo: Repo, branch: string): Promise<void> {
  let branchExists = await repo.git.refs.heads.contains(branch);
  if (!branchExists) {
    log.info(`Branch ${branch} doesn't exist, nothing to do.`);
    return;
  }
  await repo.git.refs.heads(branch).remove();
  log.info(`Deleted ${branch}`);
}

/**
 * Start a Travis build.
 */
async function startTravisBuild(repo: Repo, options: BuildOptions): Promise<void> {
  log.info(`${options.owner}/${options.repo}: going to build project ${options.project}`);
  let travis_yml = await readFileAtCommit(
    repo,
    options.project + '/.travis.yml',
    options.sha
  );
  if (!travis_yml) {
    log.info(`No .travis.yml found in ${options.project}/, skipping.`);
    return;
  }
  let config = YAML.parse(travis_yml);

  // Ensure we're building against the right commit.
  if (!config.before_install) {
    config.before_install = [];
  }
  if (options.pullRequest) {
    config.before_install.unshift(
      `git fetch origin +refs/pull/${options.pullRequest}/merge:`,
      `git checkout -qf FETCH_HEAD`,
      `cd ${options.project}`
    );
  } else {
    config.before_install.unshift(
      `git checkout -qf ${options.sha}`,
      `cd ${options.project}`
    );
  }

  // Adjust environment vars to simulate Travis env:
  if (!config.env) {
    config.env = {};
  }
  if (!config.env.global) {
    config.env.global = [];
  }
  config.env.global.unshift(
    `TRAVIS_COMMIT=${options.sha}`,
    `TRAVIS_PULL_REQUEST=${options.pullRequest || 'false'}`,
    `TRAVIS_COMMIT_RANGE=${options.commitRange}`
  );

  // Ensure Travis calls us back
  if (!config.notifications) {
    config.notifications = {};
  }
  if (!config.notifications.webhooks) {
    config.notifications.webhooks = {};
  }
  if (!config.notifications.webhooks.urls) {
    config.notifications.webhooks.urls = [];
  }
  config.notifications.webhooks.urls.push(TRAVIS_WEBHOOK_URL);
  config.notifications.webhooks.on_success = 'always';
  config.notifications.webhooks.on_failure = 'always';
  config.notifications.webhooks.on_start = 'always';

  let build_request = {
    message: `[${options.project}] ${options.message}`,
    branch: options.branch,
    config,
  };

  log.info('Authenticating with Travis...');
  let auth = await cb2promise(travis.auth.github.post, {
    github_token: process.env.GITHUB_TOKEN,
  });

  log.info('Requesting build...');
  log.debug('Build config:', JSON.stringify(build_request, null, 2));
  let response = await request({
    url: 'https://api.travis-ci.com/repo/' + options.owner + '%2F' + options.repo + '/requests',
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Travis-API-Version': '3',
      'Authorization': 'token ' + auth.access_token,
    },
    json: true,
    body: { request: build_request },
  });
  log.debug('Travis response:', JSON.stringify(response, null, 2));
}

export async function handleGitHubPullRequestEvent(
  event: PullRequestEvent
): Promise<void> {
  let pr = event.pull_request;
  let owner_name = pr.base.repo.owner.login;
  let repo_name = pr.base.repo.name;
  log.info(`${owner_name}/${repo_name}#${event.number} ${event.action}`);
  log.debug('Full event payload:', JSON.stringify(event, null, 2));

  let branch = `pr_${event.number}_merge_ci`;
  let repo = octokat.repos(owner_name, repo_name);
  if (event.action === 'closed') {
    log.info(`PR ${event.number} was closed. Mop up our CI branch.`);
    await deleteBranch(repo, branch);
    return;
  }

  if (PR_ACTIONS_THAT_KICK_OFF_BUILDS.indexOf(event.action) === -1) {
    log.info(`'${event.action}' not in ${PR_ACTIONS_THAT_KICK_OFF_BUILDS}), does not kick off a build,  ignoring event.`);
    return;
  }
  if (pr.merged) {
    log.info(`PR #${event.number} is already merged, nothing to do.`);
    return;
  }

  // Ensure PR is mergeable. GitHub doesn't always tell us
  // immediately, so keep polling the GitHub API until we know.
  log.info('Fetching PR #2 info.');
  pr = await repo.pulls(event.number).fetch();
  log.debug('Full PR info:', JSON.stringify(pr, null, 2));

  let tries = 0;
  while (pr.mergeableState === 'unknown') {
    if (tries > MAX_PR_MERGEABLE_RETRIES) {
      log.info('GitHub is taking an awful long time to determine whether the PR is mergeable. Giving up.');
      break;
    }
    log.info('Mergeable state is still unknown, refetching PR info.');
    await timeout(PR_MERGEABLE_TIMEOUT_MS);
    pr = await repo.pulls(event.number).fetch();
    tries += 1;
  }
  if (!pr.mergeable) {
    log.info(`PR #${event.number} is not mergeable, ignoring.`);
    return;
  }

  await createOrUpdateBranch(repo, branch, pr.mergeCommitSha);
  let projects = await determineProjectsToBuildForCommit(repo, pr.mergeCommitSha);
  await Promise.all(
    projects.map(
      (project) => startTravisBuild(repo, {
        repo: repo_name,
        owner: owner_name,
        message: `#${event.number}: ${pr.title}`,
        project,
        branch,
        sha: pr.mergeCommitSha,
        pullRequest: event.number,
        commitRange: `${pr.base.sha}...${pr.head.sha}`,
      })
    )
  );
}

export async function handleGitHubPushEvent(
  event: PushEvent
): Promise<void> {
  let owner_name = event.repository.owner.name;
  let repo_name = event.repository.name;
  log.info(`${owner_name}/${repo_name}: push to ${event.ref}`);
  log.debug('Full event payload:', JSON.stringify(event, null, 2));

  if (event.ref.indexOf('refs/heads/') === -1) {
    log.info(`${event.ref} is not a branch, ignoring.`);
    return;
  }

  let branch = event.ref.slice('refs/heads/'.length);
  if (branch.match(PR_BRANCH_REGEX)) {
    log.info('This branch is one of our special PR branches. Ignoring.');
    return;
  }

  let unique_projects = new Set();
  event.commits.forEach((commit) => {
    commit.added.forEach(filename => populateProjectsFromFilename(unique_projects, filename));
    commit.removed.forEach(filename => populateProjectsFromFilename(unique_projects, filename));
    commit.modified.forEach(filename => populateProjectsFromFilename(unique_projects, filename));
  });
  let projects = [...unique_projects];
  log.info(`Projects touched by push: ${projects}`);

  let repo = octokat.repos(owner_name, repo_name);
  await Promise.all(
    projects.map(
      (project) => startTravisBuild(repo, {
        repo: repo_name,
        owner: owner_name,
        message: event.head_commit.message,
        project,
        branch,
        sha: event.after,
        commitRange: `${event.before}...${event.after}`,
      })
    )
  );
}

export async function handleTravisWebhook(
  payload: TravisWebhookPayload
): Promise<void> {
  log.info(`Travis build id ${payload.id}: ${payload.state}`);
  log.debug(`Full incoming request payload:`, JSON.stringify(payload, null, 2));

  if (payload.type !== 'api') {
    log.info(`This build was not kicked off by us but by '${payload.type}'. Bailing.`);
    return;
  }

  let owner_name = payload.repository.owner_name;
  let repo_name = payload.repository.name;
  let repo = octokat.repos(owner_name, repo_name);

  // Figure out which commit to report the status for. If the build
  // was for a PR, we want to report the status on the PR's head commit.
  let sha = payload.commit;
  let pr_matches = payload.branch && payload.branch.match(PR_BRANCH_REGEX);
  if (pr_matches && pr_matches.length === 2) {
    let pr_number = pr_matches[1];
    let pr = await repo.pulls(pr_number).fetch();
    if (sha !== pr.mergeCommitSha) {
      log.warn(
        `Expected the PR merge commit to be ${sha}, but it is ${pr.mergeCommitSha}. ` +
        `Somebody must've pushed in the meantime. Aborting.`
      );
      return;
    }
    sha = pr.head.sha;
    log.info(`Build was for PR #${pr_number}, head commit ${sha}`);
  }

  let project = '';
  let project_matches = payload.message.match(PROJECT_IN_BUILD_MSG_REGEX);
  if (project_matches && project_matches.length === 2) {
    project = project_matches[1];
    log.info(`Build was for project ${project}.`);
  }

  let state = TRAVIS_TO_GITHUB_BUILD_STATES[payload.state];
  log.info(`Updating state to ${state} for commit ${sha} on GitHub...`);
  await repo.statuses(sha).create({
    state,
    target_url: payload.build_url,
    description: payload.status_message,
    context: `travis-ci/${project}`,
  });
}
