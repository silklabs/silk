//
// Cancels older Travis jobs for pull requests across all Silk projects
//

import Travis from 'travis-ci';
import cb2promise from 'promise-callback';
import makeLog from 'log';
const log = makeLog('main');

import repos from './repos';
import { getPRNumberFromBranch } from './github-travis-integration';

let travis = null;

async function loginToTravis() {
  travis = new Travis({version: '2.0.0', pro: true});

  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable undefined');
  }

  await cb2promise(travis.authenticate.bind(travis), {
    github_token: process.env.GITHUB_TOKEN,
  });
}

function recentTravisBuilds(owner, repo) {
  log.verbose(`Getting recent Travis builds for ${owner}/${repo}`);
  return new Promise((resolve, reject) => {
    travis.repos(owner, repo).builds.get((err, res) => {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    });
  });
}

export async function cancelOldPRBuilds(owner, repo) {
  if (travis === null) {
    await loginToTravis();
  }

  let activePullRequestBuilds = {};
  const res = await recentTravisBuilds(owner, repo);
  for (const build of res.builds) {
    if (['passed', 'canceled', 'failed', 'errored'].indexOf(build.state) >= 0) {
      continue; // Ignore terminal build states
    }
    let pull_request_number = build.pull_request_number ||
      getPRNumberFromBranch(build.commit.branch);
    if (!pull_request_number) {
      continue;
    }
    log.info(`PR#${pull_request_number} - ${build.id} is ${build.state}`);
    if (pull_request_number in activePullRequestBuilds) {
      log.info(`Cancelling old build ${build.id} for PR#${pull_request_number}`);
      await cb2promise(travis.builds(build.id).cancel.post);
    } else {
      activePullRequestBuilds[pull_request_number] = true;
    }
  }
}

export async function cancelAllOldPRBuilds() {
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
