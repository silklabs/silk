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
 *
 * @flow
 */

import assert from 'assert';
import Octokat from 'octokat';
import YAML from 'yamljs';
import merge from 'lodash.merge';
import cb2promise from 'promise-callback';
import createLog from 'log';

import { genTravis, triggerBuild } from './travis';

import type { TravisBuildRequest, TravisBuildResponse } from './travis';

type PullRequestEvent = Object;
type PushEvent = Object;
type TravisWebhookPayload = Object;
type Repo = Object;
type ProjectBuildRequest = TravisBuildRequest & {
  sha?: string;
  commitRange?: string;
  pullRequest?: number;
  pullRequestBaseBranch?: string;
};

if (!process.env.GITHUB_TOKEN) {
  throw new Error('GITHUB_TOKEN environment variable undefined');
}

const log = createLog('github-travis-integration');
const octokat = new Octokat({
  token: process.env.GITHUB_TOKEN,
});

const PR_ACTIONS_THAT_KICK_OFF_BUILDS = [
  'opened',
  'reopened',
  'synchronize',
];
const TRAVIS_WEBHOOK_URL = 'https://silk-releng.herokuapp.com/hooks/travis';

const TRAVIS_TO_GITHUB_BUILD_STATES = {
  created: 'pending',
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

const TRAVIS_QUERY_BUILD_DELAY_MS = 5000;

/**
 * Awaitable version of `setTimeout`.
 */
function timeout(delay_ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delay_ms);
  });
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
  let projects = Array.from(unique_projects);
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
 * Given a Pull Request number, return the name of the temporary
 * special branch that we'll create for it for CI purposes.
 */
function getCIBranchForPR(pr: number): string {
  return `pr_${pr}_merge_ci`;
}

/**
 * Given a branch name, return the number of the Pull Request that
 * this branch represents if it's one of our special PR branches, or
 * null otherwise.
 */
const PR_BRANCH_REGEX = /pr_([0-9]+)_merge_ci/;
export function getPRNumberFromBranch(branch: string): ?number {
  let matches = branch.match(PR_BRANCH_REGEX);
  if (!matches || matches.length !== 2) {
    return null;
  }
  return parseInt(matches[1], 10);
}

/**
 * Given the message (title) of a Travis build, return the project
 * that the build is targeting, or null if it doesn't target a
 * particular project.
 */
const PROJECT_IN_BUILD_MSG_REGEX = /\[([a-zA-Z0-9._-]+)\] .*/;
export function getProjectFromBuildMessage(message: string): ?string {
  let matches = message.match(PROJECT_IN_BUILD_MSG_REGEX);
  if (!matches || matches.length !== 2) {
    return null;
  }
  return matches[1];
}

/**
 * Trigger a Travis build.
 *
 * Works similarly to `triggerBuild()` from `travis.js`, except for
 * sub-project builds within the multi-project repo.
 */
export async function triggerBuildForProject(
  owner_name: string,
  repo_name: string,
  project: string,
  request: ProjectBuildRequest
): Promise<?TravisBuildResponse> {
  log.info(`${owner_name}/${repo_name}: going to build project ${project}`);
  let repo = octokat.repos(owner_name, repo_name);

  // If a commit was not explicitly provided, build the tip of the specified branch.
  let sha = request.sha;
  if (!sha) {
    let info = await repo.git.refs.heads(request.branch).fetch();
    sha = info.object.sha;
  }

  // Use the existing .travis.yml as a template. If the request contains
  // any additional configuration,
  let travis_yml = await readFileAtCommit(
    repo,
    project + '/.travis.yml',
    sha
  );
  if (!travis_yml) {
    log.info(`No .travis.yml found in ${project}/, skipping.`);
    return null;
  }
  let config = YAML.parse(travis_yml);
  if (request.config) {
    merge(config, request.config, (a, b) => {
      // We don't want to merge arrays, we want to be able to overwrite them,
      // e.g. build a smaller list of OSes or matrix variables than specified
      // in .travis.yml.
      if (Array.isArray(a)) {
        return b;
      }
      // Do whatever default behaviour otherwise.
      return undefined;
    });
  }

  // Ensure we're building against the right commit.
  if (!config.before_install) {
    config.before_install = [];
  }
  if (request.pullRequest) {
    config.before_install.unshift(
      `git fetch origin +refs/pull/${request.pullRequest}/merge:`,
      `git checkout -qf FETCH_HEAD`,
      `cd ${project}`
    );
  } else {
    config.before_install.unshift(
      `git checkout -qf ${sha}`,
      `cd ${project}`
    );
  }

  // Adjust environment vars to simulate Travis env:
  if (!config.env) {
    config.env = {};
  }
  if (!config.env.global) {
    config.env.global = [];
  }
  let commitRange = request.commitRange ||
    `0000000000000000000000000000000000000000...${sha}`;
  config.env.global.unshift(
    `TRAVIS_COMMIT=${sha}`,
    `TRAVIS_BRANCH=${request.pullRequestBaseBranch || request.branch}`,
    `TRAVIS_PULL_REQUEST=${request.pullRequest || 'false'}`,
    `TRAVIS_COMMIT_RANGE=${commitRange}`
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
    message: `[${project}] ${request.message}`,
    branch: request.branch,
    config,
  };

  log.debug('Build config:', JSON.stringify(build_request, null, 2));
  let response = await triggerBuild(owner_name, repo_name, build_request);
  log.debug('Travis response:', JSON.stringify(response, null, 2));
  return response;
}

export async function handleGitHubPullRequestEvent(
  event: PullRequestEvent
): Promise<void> {
  let pr = event.pull_request;
  let owner_name = pr.base.repo.owner.login;
  let repo_name = pr.base.repo.name;
  log.info(`${owner_name}/${repo_name}#${event.number} ${event.action}`);
  log.debug('Full event payload:', JSON.stringify(event, null, 2));

  let repo = octokat.repos(owner_name, repo_name);
  if (event.action === 'closed') {
    log.info(`PR ${event.number} was closed. Mop up our CI branch.`);
    await deleteBranch(repo, getCIBranchForPR(event.number));
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

  // Create a pending status on the PR immediately while we figure out
  // what other builds to trigger, and potentially have to wait for
  // Travis to queue and start them.
  await repo.statuses(pr.head.sha).create({
    state: 'pending',
    target_url: 'http://git.io/h3KG',
    description: '',
    context: `silk/releng/build-determinator`,
  });

  let numberOfBuilds = 0;
  try {
    numberOfBuilds = await triggerBuildsForPullRequestEvent(repo, event);
  } catch (error) {
    log.error('Error', error, error.stack);
    // Uh-oh. We failed to trigger some or all builds. Let's mark the
    // head commit as failed just to be safe so that the author gets
    // the chance to retrigger the build, hopefully with a better result.
    let description = `Failed to determine builds: ${error.message}`.slice(0, 140);
    await repo.statuses(pr.head.sha).create({
      state: 'error',
      target_url: 'http://git.io/h3KG',
      description,
      context: `silk/releng/build-determinator`,
    });
    return;
  }

  // Mark the previously pending status for the build determinator as
  // successful. If we triggered any other builds, the PR will still
  // have an overall pending status. And if we didn't trigger any
  // other builds, it will now have a success status, which is
  // important for the uplifter and autolander (because they won't
  // work on a non-existent status, it needs to be a success status).
  await repo.statuses(pr.head.sha).create({
    state: 'success',
    target_url: 'git.io/vR1YX',
    description: `Triggered ${numberOfBuilds} builds`,
    context: `silk/releng/build-determinator`,
  });
}

/**
 * Trigger Travis builds based on GitHub Pull Request event and mark
 * the PR's head commit status as pending accordingly. Returns the
 * number of builds triggered.
 */
async function triggerBuildsForPullRequestEvent(
  repo: Repo,
  event: PullRequestEvent
): Promise<number> {
  let pr = event.pull_request;
  let owner_name = pr.base.repo.owner.login;
  let repo_name = pr.base.repo.name;
  let branch = getCIBranchForPR(event.number);

  await createOrUpdateBranch(repo, branch, pr.mergeCommitSha);
  let projects = await determineProjectsToBuildForCommit(repo, pr.mergeCommitSha);
  let travisResponses = await Promise.all(
    projects.map(
      (project) => triggerBuildForProject(
        owner_name,
        repo_name,
        project,
        {
          message: `#${event.number}: ${pr.title}`,
          branch,
          sha: pr.mergeCommitSha,
          commitRange: `${pr.base.sha}...${pr.head.sha}`,
          pullRequest: event.number,
          pullRequestBaseBranch: pr.base.ref,
        }
      )
    )
  );

  // triggerBuildForProject() will return null if a build couldn't be
  // triggered for a given project. Filter those out to see how many
  // builds we actually triggered.
  let triggeredBuilds = travisResponses.filter((result) => !!result);
  log.info(`Triggered ${triggeredBuilds.length} builds for PR #${event.number}.`);

  if (triggeredBuilds.length === 0) {
    return 0;
  }

  // Travis won't call us back on the webhook when a build is queued,
  // only when one is eventually started. This can take anywhere from
  // a few seconds to a few minutes. We want to update GitHub as soon
  // as possible, though. Let's stitch this together manually. But
  // don't query Travis too soon -- it needs a bit of time to queue
  // the builds.
  await timeout(TRAVIS_QUERY_BUILD_DELAY_MS);
  let travis = await genTravis();
  let response = await cb2promise(travis.repos(owner_name, repo_name).builds.get);
  let queuedBuilds = response.builds.filter((build, index) => {
    build.commit = response.commits[index];
    assert(build.commit.id === build.commit_id);
    // Only consider builds that were just created. If they've been
    // started by now, we will have been notified via the webhook
    // already, and we don't need to update commit status twice.
    if (build.commit.sha === pr.mergeCommitSha) {
      log.info(`Build ${build.id} is for this PR, state is ${build.state}.`);
    }
    return build.commit.sha === pr.mergeCommitSha && build.state === 'created';
  });

  log.info(`Travis has queued but not yet started ${queuedBuilds.length} ` +
           `builds for this PR, reporting them to GitHub as pending.`);
  for (let build of queuedBuilds) {
    let project = getProjectFromBuildMessage(build.commit.message);
    await repo.statuses(pr.head.sha).create({
      state: 'pending',
      target_url: `https://travis-ci.com/${owner_name}/${repo_name}/builds/${build.id}`,
      description: 'Created',
      context: `travis-ci/${project}`,
    });
  }

  return triggeredBuilds.length;
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
  if (getPRNumberFromBranch(branch)) {
    log.info('This branch is one of our special PR branches. Ignoring.');
    return;
  }

  let unique_projects = new Set();
  event.commits.forEach((commit) => {
    commit.added.forEach(filename => populateProjectsFromFilename(unique_projects, filename));
    commit.removed.forEach(filename => populateProjectsFromFilename(unique_projects, filename));
    commit.modified.forEach(filename => populateProjectsFromFilename(unique_projects, filename));
  });
  let projects = Array.from(unique_projects);
  log.info(`Projects touched by push: ${projects}`);

  await Promise.all(
    projects.map(
      (project) => triggerBuildForProject(
        owner_name,
        repo_name,
        project,
        {
          message: event.head_commit.message,
          branch,
          sha: event.after,
          commitRange: `${event.before}...${event.after}`,
        }
      )
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
  let pr_number = null;
  if (payload.branch) {
    pr_number = getPRNumberFromBranch(payload.branch);
  }
  if (pr_number !== null) {
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

  let project = getProjectFromBuildMessage(payload.message);
  log.info(`Build was for project ${project}.`);
  let state = TRAVIS_TO_GITHUB_BUILD_STATES[payload.state];
  log.info(`Updating state to ${state} for commit ${sha} on GitHub...`);
  await repo.statuses(sha).create({
    state,
    target_url: payload.build_url,
    description: payload.status_message,
    context: `travis-ci/${project || ''}`,
  });
}
