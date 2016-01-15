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
  type: string,
  name?: string
): Promise<number> {
  let sha = await getBranchHeadCommit(owner, repo, branch);
  invariant(sha, `Could not find '${branch}!`);
  let responses = await triggerBuildsForEvent(
    owner,
    repo,
    {
      name,
      type,
      sha,
      branch,
      filesChanged: [],
    }
  );
  return responses.filter((response) => !!response).length;
}

function cli() {
  if (process.argv.length < 4) {
    console.error(`
Usage: build-trigger <branch> <type> [<build>]

Triggers builds based on the parameters given.

  branch     The branch to run builds against
  type       The type of builds to trigger. Valid values: push, pr, nightly
  [build]    The name of a specific build to trigger (optional).
             This can be a wildcard, e.g. "nightly-*".

Examples:

  build-trigger master nightly
  build-trigger next push app-*
`);
    process.exit(1);
  }
  const owner = 'silklabs';
  const repo = 'silk-core';
  let [/*node*/, /*script*/, branch, type, name] = process.argv;
  triggerBuilds(owner, repo, branch, type, name)
    .then((numBuilds) => console.log(`Triggered ${numBuilds} builds.`))
    .catch((err) => console.error(err.stack));
}

if (require.main === module) {
  cli();
}
