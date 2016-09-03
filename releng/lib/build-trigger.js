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

function bail(reason, err) {
  console.error('Exiting process due to ' + reason);
  console.error(err.stack || err);
  process.exit(1);
}

['unhandledRejection', 'uncaughtException'].forEach(reason => {
  process.on(reason, err => bail(reason, err));
});

export async function triggerBuilds(
  owner: string,
  repo: string,
  branch: string,
  type: string,
  name?: string
): Promise<number> {
  let sha = await getBranchHeadCommit(owner, repo, branch);
  invariant(sha, `Could not find '${branch}!`);
  let message = `build-trigger ${branch} ${type} `;
  if (name) {
    message += name;
  }
  let responses = await triggerBuildsForEvent(
    owner,
    repo,
    {
      name,
      type,
      sha,
      branch,
      message,
      // XXX: This is a massive hack to allow anyone who can run the CLI to run
      // whatever builds they like ...
      githubUser: { login: 'silk-stooge' },
    }
  );
  return responses.filter((response) => !!response).length;
}

function cli() {
  console.log(process.argv[2]);

  if (process.argv.length < 4) {
    console.log(`
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
    const code = process.argv[2] === '--help' ? 0 : 1;
    process.exit(code);
  }
  const owner = 'silklabs';
  const repo = 'silk-core';
  let [/*node*/, /*script*/, branch, type, name] = process.argv;
  triggerBuilds(owner, repo, branch, type, name)
  .then((numBuilds) => console.log(`Triggered ${numBuilds} builds.`));
}

cli();
