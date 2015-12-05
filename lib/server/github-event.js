
import makeLog from './log';
let log = makeLog('github-event');

import * as githubTool from '../github-tool.js';
import * as githubTravisIntegration from '../github-travis-integration.js';
import { cancelOldPRBuilds } from '../cancelOldPRs.js';
import { attemptUplift } from '../uplifter.js';

export function pullrequest(json) {
  let owner = json.pull_request.base.repo.owner.login;
  let repo = json.pull_request.base.repo.name;
  let pr = json.number;
  log.info(`pullrequest ${pr} in: ${owner}/${repo}: action=${json.action}`);

  if (owner === 'silklabs' && repo === 'silk-core') {
    githubTravisIntegration.handleGitHubPullRequestEvent(json)
      .catch(err => log.error('Error', err, err.stack));
  }

  if (json.pull_request.state !== 'open') {
    // Check if this PR should be uplifted to `next`
    attemptUplift(owner, repo, pr, 'next')
      .catch(err => log.error('Error', err, err.stack));
    return;
  }

  githubTool.handlePullRequestAction(owner, repo, pr, json.action)
    .catch(err => log.error('Error', err, err.stack));

  // Delay for a short while to give Travis enough time to enqueue a build
  setTimeout(
    () => {
      log.info('Checking for older PR builds that should be cancelled');
      cancelOldPRBuilds(owner, repo)
        .catch(err => log.error('Error', err, err.stack));
    },
    30 * 1000
  );
}

export function push(json) {
  let owner = json.repository.owner.name;
  let repo = json.repository.name;
  if (owner === 'silklabs' && repo === 'silk-core') {
    githubTravisIntegration.handleGitHubPushEvent(json)
      .catch(err => log.error('Error', err, err.stack));
  }
}

export function status(json) {
  let owner = json.repository.owner.login;
  let repo = json.repository.name;

  log.info('status in:', owner, repo);
  log.info('status.state:', json.state);

  if (json.state === 'success') {
    // Check if any PRs in this repo should be merged, as unfortunately the status
    // API provides no link from commit status and corresponding pull request
    githubTool.autoMergePullRequests(owner, repo)
      .catch(err => log.error('Error', err, err.stack));
  }
}
