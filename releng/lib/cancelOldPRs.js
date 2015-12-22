/**
 * Cancels older Travis jobs for pull requests across all Silk projects
 *
 * @flow
 */

import assert from 'assert';
import cb2promise from 'promise-callback';
import createLog from 'log';

import repos from './repos';
import { genTravis } from './travis';
import {
  getPRNumberFromBranch,
  getProjectFromBuildMessage,
} from './github-travis-integration';

const log = createLog('cancelOldPRs');

export async function cancelOldPRBuilds(
  owner: string,
  repo: string
): Promise<void> {
  let activePullRequestBuilds = {};

  log.verbose(`Getting recent Travis builds for ${owner}/${repo}`);
  let travis = await genTravis();
  const res = await cb2promise(travis.repos(owner, repo).builds.get);

  await Promise.all(res.builds.map(async (build, index) => {
    if (['passed', 'canceled', 'failed', 'errored'].indexOf(build.state) >= 0) {
      return; // Ignore terminal build states
    }

    let commit = res.commits[index];
    assert(commit.id === build.commit_id);

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

    log.info(`PR #${pull_request_number}: [${project}] - ${build.id} is ${build.state}`);
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

export async function cancelAllOldPRBuilds(): Promise<void> {
  for (const repo of repos) {
    await cancelOldPRBuilds('silklabs', repo);
  }
}

if (require.main === module) {
  (async function main() {
    try {
      await cancelAllOldPRBuilds();
      log.info('Success');
    } catch (err) {
      log.error(err.stack);
    }
  })();
}
