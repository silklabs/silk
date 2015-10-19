
import makeLog from './log';
let log = makeLog('github-event');

import * as githubTool from '../github-tool.js';
import { cancelOldPRBuilds } from '../cancelOldPRs.js';

export function pullrequest(json) {
  let owner = json.pull_request.base.repo.owner.login;
  let repo = json.pull_request.base.repo.name;
  let pr = json.number;

  log.info(`pullrequest ${pr} in: ${owner}/${repo}: action=${json.action}`);
  if (json.pull_request.state !== 'open') {
    log.info('pullrequest is closed');
    return;
  }

  log.info('Checking if this PR should be automerged');
  githubTool.autoMergePullRequest(owner, repo, pr)
  .catch(err => {
    log.error('Error', err.stack);
  });

  // Delay for a short while to give Travis enough time to enqueue a build
  setTimeout(
    () => {
      log.info('Checking for older PR builds that should be cancelled');
      cancelOldPRBuilds(owner, repo)
      .catch(err => {
        log.error('Error', err.stack);
      });
    },
    30 * 1000
  );
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
    .catch(err => {
      log.error('Error', err.stack);
    });
  }
}
