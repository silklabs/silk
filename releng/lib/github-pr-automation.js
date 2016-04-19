/**
 * @flow
 */
import { getOctokat, makeGitHubLog } from './github';
import type { PullRequestInfo } from './github';

const LOG_PREFIX = 'github-pr-automation';

export function maybeCreatePullRequest(
  destOwner: string,
  destRepo: string,
  destBranch: string,
  sourceBranch: string
): Promise<void> {
  const r = getOctokat().repos(destOwner, destRepo);
  const log = makeGitHubLog(LOG_PREFIX, destOwner, destRepo);
  log.info(`Fetching pull requests...`);

  function checkForActivePr(pulls: Object): Promise<void> {
    log.info(`(Found ${pulls.length} pull requests)`);
    let activePr = pulls.find((pr) => pr.head.ref === sourceBranch);
    if (activePr) {
      log.info(`Open pull request for branch ${sourceBranch} already exists: ${activePr.number}`);
      return Promise.reject(undefined);
    }
    if (pulls.nextPage) {
      log.info('Fetching more pull requests...');
      return pulls.nextPage().then(checkForActivePr);
    }
    return Promise.resolve();
  }

  return r.pulls.fetch({base: destBranch})
  .then(checkForActivePr)
  .then(() => {
    log.info(`Creating a new pull request from the branch ${sourceBranch}`);
    return r.pulls.create({
      title: 'Automated merge from ' + sourceBranch + ' to ' + destBranch,
      head: sourceBranch,
      base: destBranch,
    });
  })
  .catch(err => {
    // Yuck, there doesn't seem to be more succinct way to determine that there
    // are no commits to merge...
    if (err && err.status === 422) {
      const json = err.json;
      if (json.message === 'Validation Failed' &&
          json.errors.length === 1 &&
          json.errors[0].resource === 'PullRequest' &&
          json.errors[0].code === 'custom' &&
          json.errors[0].message === 'No commits between ' + destBranch + ' and ' + sourceBranch) {
        log.info(`Nothing to merge from ${sourceBranch} to ${destBranch}`);
        return Promise.reject(undefined);
      }
    }
    return Promise.reject(err);
  })
  .then(result => {
    log.info(`Created pull request ${result.number}`);
    return r.issues(result.number).labels.create(['automerge']);
  })
  .then(() => {
    log.info(`Successfully added 'automerge' label to pull request.`);
  })
  .catch(err => {
    if (err) {
      return Promise.reject(err);
    }
    return Promise.resolve();
  });
}


export async function autoMergePullRequest(
  owner: string,
  repo: string,
  pr: number
): Promise<void> {
  const r = getOctokat().repos(owner, repo);
  const log = makeGitHubLog(LOG_PREFIX, owner, repo, pr);

  log.info(`fetching info`);
  let result = await r.issues(pr).fetch();
  log.debug(`title: ${result.title}`);
  log.debug(`number: ${result.number}`);
  log.debug(`state: ${result.state}`);

  if (!result.pullRequest) {
    log.info(`this is an issue, not a pull request.`);
    return;
  }

  if (result.state !== 'open') {
    log.info(`pull request is not open.`);
    return;
  }

  const label = result.labels.find((label) => label.name === 'automerge');
  if (!label) {
    log.info(`missing the 'automerge' label.`);
    return;
  }

  // Switch to the 'pull' API to get CI status
  log.debug(`fetching info`);
  result = await r.pulls(result.number).fetch();

  if (result.mergeable === null) {
    // Ref: https://developer.github.com/v3/pulls/#response-1
    log.info(`mergeable state is not yet known.`);
    return;
  }

  if (result.mergeable === false) {
    log.info(`not mergeable`);
    await r.issues(result.number).comments.create({
      'body': ':broken_heart: Unable to automerge due to merge conflict',
    });
    await r.issues(result.number).labels('automerge').remove();
    return;
  }

  // Check the CI status of the head SHA
  log.debug(`fetching CI status for head SHA ${result.head.sha}`);
  let status = await r.commits(result.head.sha).status.fetch();
  log.info(`CI status: ${status.state}`);

  switch (status.state) {
  case 'success':
    log.info(`CI status is success, trying to merge...`);
    let mergeResult = await r.pulls(result.number).merge.add({
      sha: result.head.sha,
      commit_message: 'automerge',
    });
    log.info(`successfully merged: ${mergeResult}`);
    return;

  case 'failure':
    log.info(`CI status is failure, not going to merge.`);
    await r.issues(result.number).comments.create({
      'body': ':broken_heart: Unable to automerge due to CI failure',
    });
    await r.issues(result.number).labels('automerge').remove();
    return;

  default:
    return;
  }
}


function forAllOpenPullRequests(
  owner: string,
  repo: string,
  cb: ((pr: PullRequestInfo) => Promise<void>)
): Promise<void> {
  const r = getOctokat().repos(owner, repo);
  const log = makeGitHubLog(LOG_PREFIX, owner, repo);
  log.info(`Fetching pull requests...`);

  function checkPulls(pulls: Object): Promise<void> {
    log.info(`(Found ${pulls.length} pull requests)`);
    return pulls.reduce(
      (promise, pr) => promise.then(() => cb(pr)),
      Promise.resolve()
    ).then(() => {
      if (pulls.nextPage) {
        log.info(`Fetching more pull requests...`);
        return pulls.nextPage().then(checkPulls);
      }
      return Promise.resolve();
    });
  }

  return r.pulls.fetch().then(checkPulls);
}


export function autoMergePullRequests(
  owner: string,
  repo: string
): Promise<void> {
  const log = makeGitHubLog(LOG_PREFIX, owner, repo);
  log.info(`autoMergePullRequests...`);
  return forAllOpenPullRequests(owner, repo, prInfo => {
    return autoMergePullRequest(owner, repo, prInfo.number);
  });
}


function handleCommitsPushedToPullRequest(
  owner: string,
  repo: string,
  pr: number
): Promise<void> {
  const r = getOctokat().repos(owner, repo);
  const log = makeGitHubLog(LOG_PREFIX, owner, repo, pr);
  log.debug(`fetching info`);

  return r.issues(pr).fetch().then(result => {
    let automerge = result.labels.find(label => {
      return label.name === 'automerge';
    });

    if (!automerge) {
      log.debug(`no automerge label, ignoring.`);
      return Promise.resolve();
    }

    log.info(`new commits were pushed while 'automerge' label was present.`);
    return r.issues(pr).comments.create({
      'body': ':scream: New commits were pushed while the automerge label was present.',
    }).then(() => r.issues(pr).labels('automerge').remove());
  });
}


export function handlePullRequestAction(
  owner: string,
  repo: string,
  pr: number,
  action: string
): Promise<void> {
  const log = makeGitHubLog(LOG_PREFIX, owner, repo, pr);
  if (action === 'synchronize') {
    log.info(`new commits were pushed`);
    return handleCommitsPushedToPullRequest(owner, repo, pr);
  }

  log.info(`checking if it should be automerged`);
  return autoMergePullRequest(owner, repo, pr);
}


export async function checkPullRequestForPublicChanges(
  pr: PullRequestInfo,
  filesChanged: Array<string>
): Promise<void> {
  const owner_name = pr.base.repo.owner.login;
  const repo_name = pr.base.repo.name;
  if (owner_name !== 'silklabs' ||
      repo_name !== 'silk-core') {
    return;
  }

  const repo = getOctokat().repos(owner_name, repo_name);
  const log = makeGitHubLog(LOG_PREFIX, owner_name, repo_name, pr.number);

  const issue = await repo.issues(pr.number).fetch();
  const hasPublicLabel = issue.labels.find((label) => label.name === 'PUBLIC');

  if (!filesChanged.some((filename) => filename.startsWith('pub/'))) {
    log.info(`No changes to public files detected.`);
    if (hasPublicLabel) {
      log.info(`Removing PUBLIC label.`);
      await repo.issues(pr.number).labels('PUBLIC').remove();
    }
    return;
  }

  // Nothing to do if we already added the PUBLIC label.
  if (hasPublicLabel) {
    return;
  }

  await repo.issues(pr.number).comments.create({
    body: ':earth_americas: This PR contains changes to public files. As soon as it will be merged, these changes will be made public along with the corresponding commit messages. Make sure neither contain confidential information!',
  });
  await repo.issues(pr.number).labels.create(['PUBLIC']);
}
