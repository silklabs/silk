/**
 * Helpers for querying and anipulating GitHub repository data.
 *
 * @flow
 */

import Octokat from 'octokat';
import createLog from 'silk-log';

export type PullRequestInfo = Object;

/**
 * Awaitable version of `setTimeout`.
 */
export function timeout(delay_ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delay_ms);
  });
}

let _octokat = null;
export function getOctokat(): Octokat {
  if (_octokat) {
    return _octokat;
  }
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable undefined');
  }
  _octokat = new Octokat({
    token: process.env.GITHUB_TOKEN,
  });
  return _octokat;
}

export function makeGitHubLog(
  libraryName: string,
  owner: string,
  repo: string,
  object: ?string | ?number
): any {
  let prefix = `${owner}/${repo}`;
  if (object) {
    prefix += `#${object}`;
  }
  prefix += `:`;

  let obj = createLog(libraryName);
  Object.keys(obj).forEach((level) => {
    let func = obj[level];
    obj[level] = (...args: Array<any>) => func(prefix, ...args);
  });
  return obj;
}

/**
 * Read the contents of a file at a given commit.
 */
export async function readFileAtCommit(
  owner: string,
  repo: string,
  sha: string,
  filename: string
): Promise<?string> {
  let repository = getOctokat().repos(owner, repo);
  let log = makeGitHubLog('github', owner, repo, sha);
  let contents = null;
  try {
    contents = await repository.contents(filename).read({ref: sha});
    log.info(`read ${filename}`);
  } catch (ex) {
    log.info(`could not read ${filename}`);
  }
  return contents;
}

/**
 * Get files changed, added, or deleted in a given commit.
 */
export async function filenamesTouchedByCommit(
  owner: string,
  repo: string,
  sha: string
): Promise<Array<string>> {
  let repository = getOctokat().repos(owner, repo);
  let commit = await repository.commits(sha).fetch();
  return commit.files.map((file) => file.filename);
}

/**
 * Create a branch called `branch` off the given commit. The branch
 * will be force-updated if it already exists.
 */
export async function createOrUpdateBranch(
  owner: string,
  repo: string,
  branch: string,
  sha: string
): Promise<void> {
  let repository = getOctokat().repos(owner, repo);
  let log = makeGitHubLog('github', owner, repo, branch);

  let ref = null;
  try {
    ref = await repository.git.refs.heads(branch).fetch();
  } catch (err) { // eslint-disable-line no-empty
    // Ignore.
  }

  if (!ref) {
    log.info(`branch doesn't exist yet, creating it to point to ${sha}...`);
    await repository.git.refs.create({
      ref: 'refs/heads/' + branch,
      sha,
    });
    return;
  }
  if (ref.object.sha !== sha) {
    log.info(`branch exists, but is at ${ref.object.sha}, updating it to ${sha}...`);
    await repository.git.refs.heads(branch).update({
      sha,
      force: true,
    });
    return;
  }
  log.info(`branch is up-to-date.`);
}

export async function deleteBranch(
  owner: string,
  repo: string,
  branch: string
): Promise<void> {
  let repository = getOctokat().repos(owner, repo);
  let log = makeGitHubLog('github', owner, repo, branch);

  let branchExists = await repository.git.refs.heads.contains(branch);
  if (!branchExists) {
    log.info(`branch doesn't exist, nothing to delete`);
    return;
  }

  await repository.git.refs.heads(branch).remove();
  log.info(`branch deleted`);
}

/**
 * Return the SHA of the head commit for the given branch, or null if
 * the branch is invalid (or the information can't be retrieved for
 * any other reason.)
 */
export async function getBranchHeadCommit(
  owner: string,
  repo: string,
  branch: string
): Promise<?string> {
  const repository = getOctokat().repos(owner, repo);
  const log = makeGitHubLog('github', owner, repo, branch);

  let sha = null;
  try {
    let info = await repository.git.refs.heads(branch).fetch();
    sha = info.object.sha;
  } catch (ex) {
    log.info(`could not find head commit for this branch`);
  }
  return sha;
}

export function createMilestone(
  owner: string,
  repo: string,
  title: string,
  dueDate: Date
): Promise<any> {
  let repository = getOctokat().repos(owner, repo);
  let log = makeGitHubLog('github', owner, repo);
  log.info(`Creating milestone '${title}', due on: ${dueDate.toISOString()}`);
  return repository.milestones.create({
    'title': title,
    'due_on': dueDate.toISOString(),
  });
}

const MAX_PR_MERGEABLE_RETRIES = 8;
const PR_MERGEABLE_TIMEOUT_MS = 500;

/**
 * GitHub doesn't always immediately reply with a mergeable state, so
 * keep polling the API until we get an answer. Note: this does not
 * guarantee that the PR is mergeable, it merely guarantees that the
 * status of mergeability is known.
 */
export async function getPullRequestInfoWithMergeability(
  owner: string,
  repo: string,
  pr: number
): Promise<?PullRequestInfo> {
  const log = makeGitHubLog('github', owner, repo);
  const repository = getOctokat().repos(owner, repo);
  let info = await repository.pulls(pr).fetch();
  log.debug('Full PR info:', JSON.stringify(info, null, 2));

  let tries = 0;
  while (info.mergeableState === 'unknown') {
    if (tries > MAX_PR_MERGEABLE_RETRIES) {
      log.info('GitHub is taking an awful long time to determine whether ' +
               'the PR is mergeable. Giving up.');
      return null;
    }
    log.info('Mergeable state still unknown, refetching PR info.');
    await timeout(PR_MERGEABLE_TIMEOUT_MS);
    info = await repository.pulls(pr).fetch();
    tries += 1;
  }
  return info;
}

export function hasOrgMembership(org: string, login: string): Promise<boolean> {
  return getOctokat().orgs(org).members.contains(login);
}
