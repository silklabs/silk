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
 * 1. We get notified on PRs and pushes to silk-core. We analyze the
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

import invariant from 'assert';
import YAML from 'yamljs';
import merge from 'lodash.merge';
import cb2promise from 'promise-callback';
import createLog from 'silk-log';

import {
  timeout,
  getOctokat,
  filenamesTouchedByCommit,
  readFileAtCommit,
  createOrUpdateBranch,
  deleteBranch,
  getBranchHeadCommit,
  makeGitHubLog,
  getPullRequestInfoWithMergeability,
} from './github';
import {
  checkPullRequestForExportableChanges,
} from './github-pr-automation';
import {
  genTravis,
  triggerBuild,
} from './travis';
import {
  BUILDS_DEFINITION_FILE,
  determineBuildsForEvent,
} from './build-determinator';

import type { TravisBuildRequest, TravisBuildResponse } from './travis';
import type { BuildTriggerEvent } from './build-determinator';
import type { PullRequestInfo } from './github';

type PullRequestEvent = Object;
type PushEvent = Object;
type TravisWebhookPayload = Object;

/**
 * An extension of BuildTriggerEvent that contains information
 * necessary to create kick off ProjectBuildRequest with Travis for
 * each build.
 */
type TravisBuildTriggerEvent = BuildTriggerEvent & {
  message?: string;
  buildBranch?: string; // Branch to build, defaults to `branch` if missing.
  commitRange?: string;
  pullRequest?: number;
  pullRequestBaseBranch?: string;
};

type ProjectBuildRequest = TravisBuildRequest & {
  project: string;
  travis_yml: string;
  cwd?: string;
  sha?: string;
  commitRange?: string;
  pullRequest?: number;
  pullRequestBaseBranch?: string;
};

const LOG_PREFIX = 'github-travis-integration';

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

const TRAVIS_QUERY_BUILD_DELAY_MS = 5000;


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
 * Trigger builds given a trigger event.
 *
 * A trigger event could be a PR, push, nightly script, etc. The event
 * object contains information about the circumstances (the commit,
 * branch, etc. to build), according to which the build determinator
 * can figure out which builds to trigger.
 */
export async function triggerBuildsForEvent(
  owner_name: string,
  repo_name: string,
  event: TravisBuildTriggerEvent
): Promise<Array<?TravisBuildResponse>> {
  const builds = await determineBuildsForEvent(owner_name, repo_name, event);
  let buildRequests = builds.map((build) => {
    return {
      project: build.name,
      travis_yml: build.travis_yml,
      config: build.travis_config,
      cwd: build.cwd,
      sha: event.sha,
      branch: event.buildBranch || event.branch,
      message: event.message || build.title,
      commitRange: event.commitRange,
      pullRequest: event.pullRequest,
      pullRequestBaseBranch: event.pullRequestBaseBranch,
    };
  });
  return await Promise.all(buildRequests.map(
    (request) => triggerBuildForProject(owner_name, repo_name, request)
  ));
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
  request: ProjectBuildRequest
): Promise<?TravisBuildResponse> {
  const log = makeGitHubLog(LOG_PREFIX, owner_name, repo_name);
  log.info(`Going to build project ${request.project}`);

  // If a commit was not explicitly provided, build the tip of the specified branch.
  let sha = request.sha;
  if (!sha && request.branch) {
    sha = await getBranchHeadCommit(owner_name, repo_name, request.branch);
  }
  invariant(sha, `'${String(request.branch)}' is an invalid branch`);

  // Use the existing .travis.yml as a template. If the request contains
  // any additional configuration,
  let travis_yml = await readFileAtCommit(
    owner_name,
    repo_name,
    sha,
    request.travis_yml
  );
  if (!travis_yml) {
    throw new Error(`Travis configuration not found at ${request.travis_yml} !`);
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
      `cd ${request.cwd || '.'}`
    );
  } else {
    config.before_install.unshift(
      `git checkout -qf ${sha}`,
      `cd ${request.cwd || '.'}`
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
    message: `[${request.project}] ${String(request.message)}`,
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
  let owner_name = event.pull_request.base.repo.owner.login;
  let repo_name = event.pull_request.base.repo.name;
  const log = makeGitHubLog(LOG_PREFIX, owner_name, repo_name, event.number);
  log.debug('Full event payload:', JSON.stringify(event, null, 2));

  if (event.action === 'closed') {
    log.info('PR was closed. Mop up our CI branch.');
    await deleteBranch(owner_name, repo_name, getCIBranchForPR(event.number));
    return;
  }

  log.info(`Action '${event.action}'`);
  if (PR_ACTIONS_THAT_KICK_OFF_BUILDS.indexOf(event.action) === -1) {
    log.info(
      `'${event.action}' not in ` +
      PR_ACTIONS_THAT_KICK_OFF_BUILDS.join(', ') +
      `, ignoring event.`);
    return;
  }

  if (event.pull_request.merged) {
    log.info('PR is already merged, nothing to do.');
    return;
  }

  let pr = await getPullRequestInfoWithMergeability(
    owner_name,
    repo_name,
    event.number
  );
  if (!pr || !pr.mergeable) {
    log.info('PR is not mergeable, aborting.');
    return;
  }

  // Create a pending status on the PR immediately while we figure out
  // what other builds to trigger, and potentially have to wait for
  // Travis to queue and start them.
  const repo = getOctokat().repos(owner_name, repo_name);
  await repo.statuses(pr.head.sha).create({
    state: 'pending',
    target_url: 'http://git.io/h3KG',
    description: 'Determining which builds to trigger',
    context: `silk-releng/build-determinator`,
  });

  let numberOfBuilds = 0;
  try {
    numberOfBuilds = await triggerBuildsForPullRequest(pr, event.sender);
  } catch (error) {
    log.error('Error', error, error.stack);
    // Uh-oh. We failed to trigger some or all builds. Let's mark the
    // head commit as failed just to be safe so that the author gets
    // the chance to retrigger the build, hopefully with a better result.
    await repo.statuses(pr.head.sha).create({
      state: 'error',
      target_url: 'https://dashboard.heroku.com/apps/silk-releng/resources',
      description: `Failed to determine builds. Check Papertrail logs for details.`,
      context: `silk-releng/build-determinator`,
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
    target_url: 'http://git.io/vR1YX',
    description: `Triggered ${numberOfBuilds} builds`,
    context: `silk-releng/build-determinator`,
  });
}

/**
 * Trigger Travis builds based on a GitHub Pull Request payload and
 * mark the PR's head commit status as pending accordingly. Returns
 * the number of builds triggered.
 */
async function triggerBuildsForPullRequest(
  pr: PullRequestInfo,
  githubUser: {
    login: string,
  },
): Promise<number> {
  let owner_name = pr.base.repo.owner.login;
  let repo_name = pr.base.repo.name;
  let repo = getOctokat().repos(owner_name, repo_name);
  const log = makeGitHubLog(LOG_PREFIX, owner_name, repo_name, pr.number);

  const branch = getCIBranchForPR(pr.number);
  await createOrUpdateBranch(owner_name, repo_name, branch, pr.mergeCommitSha);

  const filesChanged = await filenamesTouchedByCommit(
    owner_name,
    repo_name,
    pr.mergeCommitSha
  );
  const travisResponses = await triggerBuildsForEvent(
    owner_name,
    repo_name,
    {
      type: 'pr',
      sha: pr.mergeCommitSha,
      branch: pr.base.ref,
      buildBranch: branch,
      filesChanged,
      message: `#${pr.number}: ${pr.title}`,
      commitRange: `${pr.base.sha}...${pr.head.sha}`,
      pullRequest: pr.number,
      pullRequestBaseBranch: pr.base.ref,
      githubUser,
    }
  );

  // triggerBuildForProject() will return null if a build couldn't be
  // triggered for a given project. Filter those out to see how many
  // builds we actually triggered.
  let triggeredBuilds = travisResponses.filter((result) => !!result);
  log.info(`Triggered ${triggeredBuilds.length} builds.`);

  // While we're at it and have all the information handy, check
  // whether the commit touches public files.
  await checkPullRequestForExportableChanges(pr, filesChanged);

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
  log.info(`checking Travis for builds.`);
  let travis = await genTravis();
  let response = await cb2promise(travis.repos(owner_name, repo_name).builds.get);
  let queuedBuilds = response.builds.filter((build, index) => {
    build.commit = response.commits[index];
    invariant(build.commit.id === build.commit_id);
    // Only consider builds that were just created. If they've been
    // started by now, we will have been notified via the webhook
    // already, and we don't need to update commit status twice.
    if (build.commit.sha === pr.mergeCommitSha) {
      log.info(`found build ${build.id}, state is ${build.state}.`);
    }
    return build.commit.sha === pr.mergeCommitSha && build.state === 'created';
  });

  log.info(`Travis has queued but not yet started ${queuedBuilds.length} ` +
           `builds, reporting them to GitHub as pending.`);
  for (let build of queuedBuilds) {
    let project = getProjectFromBuildMessage(build.commit.message);
    await repo.statuses(pr.head.sha).create({
      state: 'pending',
      target_url: `https://travis-ci.com/${owner_name}/${repo_name}/builds/${build.id}`,
      description: 'Created',
      context: `travis-ci/${String(project)}`,
    });
  }

  return triggeredBuilds.length;
}

export async function handleGitHubPushEvent(
  event: PushEvent
): Promise<void> {
  let owner_name = event.repository.owner.name;
  let repo_name = event.repository.name;
  let log = makeGitHubLog(LOG_PREFIX, owner_name, repo_name);
  log.info(`Push to ${event.ref}`);
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

  log = makeGitHubLog(LOG_PREFIX, owner_name, repo_name, branch);

  log.info(`Found '${BUILDS_DEFINITION_FILE}'! Using build determinator to trigger builds.`);
  const filesChangedGroupedByCommit = event.commits.map(
    (commit) => commit.added.concat(commit.removed, commit.modified)
  );
  const filesChanged = [].concat(...filesChangedGroupedByCommit);
  await triggerBuildsForEvent(
    owner_name,
    repo_name,
    {
      type: 'push',
      sha: event.after,
      branch,
      filesChanged,
      message: event.head_commit.message,
      commitRange: `${event.before}...${event.after}`,
      githubUser: event.sender,
    }
  );
}

export async function handleTravisWebhook(
  payload: TravisWebhookPayload
): Promise<void> {
  let log = createLog(LOG_PREFIX);
  log.info(`Travis build id ${payload.id}: ${payload.state}`);
  log.debug(`Full incoming request payload:`, JSON.stringify(payload, null, 2));

  if (payload.type !== 'api') {
    log.info(`This build was not kicked off by us but by '${payload.type}'. Bailing.`);
    return;
  }

  let owner_name = payload.repository.owner_name;
  let repo_name = payload.repository.name;
  log = makeGitHubLog(LOG_PREFIX, owner_name, repo_name, payload.branch);
  let repo = getOctokat().repos(owner_name, repo_name);

  // Figure out which commit to report the status for. If the build
  // was for a PR, we want to report the status on the PR's head commit.
  let sha = payload.commit;
  let pr_number = null;
  if (payload.branch) {
    pr_number = getPRNumberFromBranch(payload.branch);
  }
  if (pr_number !== null) {
    log = makeGitHubLog(LOG_PREFIX, owner_name, repo_name, pr_number);
    let pr = await repo.pulls(pr_number).fetch();
    if (sha !== pr.mergeCommitSha) {
      // The PR's merge commit is not the same, but that could be
      // because the target branch has received new commits. We only
      // care that the PR's head commit stayed the same.
      let buildCommitInfo = await repo.commits(sha).fetch();
      if (buildCommitInfo.parents.length !== 2 ||
          buildCommitInfo.parents[1].sha !== pr.head.sha) {
        log.warn(`New commits were pushed to PR while Travis was running. ` +
                 `Ignore build results.`);
        return;
      }
    }
    sha = pr.head.sha;
    log.info(`Build was for this PR, head commit ${sha}`);
  }

  let project = getProjectFromBuildMessage(payload.message);
  log.info(`Build was for project ${String(project)}.`);
  let state = TRAVIS_TO_GITHUB_BUILD_STATES[payload.state];
  log.info(`Updating state to ${state} for commit ${sha} on GitHub...`);
  await repo.statuses(sha).create({
    state,
    target_url: payload.build_url,
    description: payload.status_message,
    context: `travis-ci/${project || ''}`,
  });
}

export async function cancelOldPRBuilds(
  owner: string,
  repo: string
): Promise<void> {
  const log = makeGitHubLog(LOG_PREFIX, owner, repo);
  let activePullRequestBuilds = {};

  log.verbose(`Getting recent Travis builds.`);
  let travis = await genTravis();
  const res = await cb2promise(travis.repos(owner, repo).builds.get);

  await Promise.all(res.builds.map(async (build, index) => {
    if (['passed', 'canceled', 'failed', 'errored'].indexOf(build.state) >= 0) {
      return; // Ignore terminal build states
    }

    let commit = res.commits[index];
    invariant(commit.id === build.commit_id);

    // If Travis didn't provide a PR number, it might still be a build for
    // a PR triggered by the machinery in github-travis-integration.js.
    let pull_request_number = build.pull_request_number;
    let project = null;
    if (!pull_request_number) {
      pull_request_number = getPRNumberFromBranch(commit.branch);
      project = getProjectFromBuildMessage(commit.message);
    }

    // Ignore any non-PR builds.
    if (!pull_request_number) {
      return;
    }

    log.info(`PR #${pull_request_number}: [${String(project)}] - ${build.id} is ${build.state}`);
    let existingBuildSha = activePullRequestBuilds[pull_request_number];

    if (!existingBuildSha) {
      // First build we encounter for this PR. Remember the commit SHA
      // so we can tell later if another build is for the same SHA
      // (that's ok) or for a different (that's not ok, we want to
      // cancel those.)
      log.info(`PR #${pull_request_number}: this is the most recent build, allowing it to run.`);
      activePullRequestBuilds[pull_request_number] = commit.sha;
      return;
    }

    if (existingBuildSha === commit.sha) {
      log.info(`PR #${pull_request_number}: this build is running against ` +
               `same commit as the most recent build(s). Allowing it to run.`);
      return;
    }

    log.info(`PR #${pull_request_number}: this build is running against ` +
             `outdated commit, cancelling it.`);
    await cb2promise(travis.builds(build.id).cancel.post);
  }));
}
