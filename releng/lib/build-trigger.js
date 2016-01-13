/**
 * Trigger nightly builds
 *
 * @flow
 */

/* eslint-disable no-console */
/* eslint-disable no-process-exit */

import invariant from 'assert';

import { getBranchHeadCommit } from './github';
import { triggerBuildsForEvent } from './github-travis-integration';

export async function triggerBuilds(
  owner: string,
  repo: string,
  branch: string,
  type: string
): Promise<void> {
  let sha = await getBranchHeadCommit(owner, repo, branch);
  invariant(sha, `Could not find '${branch}!`);
  let responses = await triggerBuildsForEvent(
    owner,
    repo,
    {
      type,
      sha,
      branch,
      filesChanged: [],
    }
  );
  let builds = responses.filter((response) => !!response);
  console.log(`Triggered ${builds.length} builds.`);
}

function cli() {
  if (process.argv.length !== 4) {
    console.error('Usage: build-trigger <branch> <type>');
    process.exit(1);
  }
  const owner = 'silklabs';
  const repo = 'silk-core';
  let [/*node*/, /*script*/, branch, type] = process.argv;
  triggerBuilds(owner, repo, branch, type)
    .catch((err) => console.error(err.stack));
}

if (require.main === module) {
  cli();
}
