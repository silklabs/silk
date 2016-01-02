/**
 * Uplifts Pull Requests from master into stabilization branches
 *
 * @flow
 */

import makeLog from 'log';
const log = makeLog('main');
import silkrepos from './repos';
import Octokat from 'octokat'; // Ref: https://www.npmjs.com/package/octokat
import child_process from 'child_process';

if (!process.env.GITHUB_TOKEN) {
  throw new Error('GITHUB_TOKEN environment variable undefined');
}

let octo = new Octokat({
  token: process.env.GITHUB_TOKEN,
});

/**
 * Performs an uplift of the given Pull Request.
 *
 * An uplift is only performed if the Pull Request is marked with the
 * <destination branch>+ label and has been merged into the `master` branch.
 *
 * The uplift is performed with the silk-stooge account by:
 *
 * 1. Creating a new branch in the silk-stooge's repo fork (which is assumed to
 * magically exist already -- this magic is performed one time by a human) from
 * the HEAD of the destination branch.
 *
 * 2. Creating a new Issue to track the uplift, assigning it to the owner of the
 * original Pull Request for accountability.  The <destination branch>+ label is
 * then removed from the original Pull Request so that it won't be considered in
 * the future for uplift.
 *
 * 3. Locally attempt to cherry pick the commits (unfortunately the Github API
 * not powerful enough to do this remotely).  If the cherry picks are
 * successful, the new Issue is converted into a Pull Request into the
 * destination branch and marked with the `automerge` label.  On failure the
 * human is summoned.
 *
 */
export async function attemptUplift(
  owner: string,
  repo: string,
  pr: number,
  destBranch: string = 'next'
): Promise<boolean> {
  let sharedRepo = octo.repos(owner, repo);

  log.info(`${repo}: Considering PR #${pr} for uplift to ${destBranch}`);
  const upliftPrBranchName = `${destBranch}-${pr}`;
  const upliftApprovedLabel = destBranch + '+';

  let issue = await sharedRepo.issues(pr).fetch();
  if (issue.state !== 'closed') {
    log.warn(`#${pr} is not closed`);
    return false;
  }

  var label = issue.labels.find(label => {
    return label.name === upliftApprovedLabel;
  });
  if (!label) {
    log.warn(`#${pr} does not have '${upliftApprovedLabel}' label.`);
    return false;
  }

  log.verbose(`Fetching PR #${pr}`);
  let pull = await sharedRepo.pulls(pr).fetch();

  if (!pull.merged) {
    log.warn(`#${pr} is not merged.`);
    return false;
  }
  if (pull.base.ref !== 'master') {
    log.warn(`#${pr} was not merged to the master branch.`);
    return false;
  }

  // Generate the uplift command
  log.verbose(`Fetching commits for PR #${pr}`);
  const commits = await sharedRepo.pulls(pr).commits.fetch();
  const foundMergeCommit = commits.find(commit => commit.parents.length !== 1);
  const upliftCommand = `rm -rf uplift &&
git clone --branch=${destBranch} git@github.com:${owner}/${repo}.git uplift &&
cd uplift &&
( git branch -D ${upliftPrBranchName} 2> /dev/null || true ) &&
git branch ${upliftPrBranchName} origin/${destBranch} &&
git checkout ${upliftPrBranchName} &&
git cherry-pick ${commits.map(c => c.sha).join(' ')} &&
git remote add stooge git@github.com:silk-stooge/${repo}.git &&
git push --force stooge ${upliftPrBranchName}`;

  // Create an issue to "transfer ownership" of the upliftApprovedLabel
  let newissue = await sharedRepo.issues.create({
    title: `Uplift to ${destBranch}: ${pull.title}`,
    body: `Uplift of #${pr} to **${destBranch}** ` +
            `via https://github.com/${owner}/${repo}/tree/${upliftPrBranchName}:\n` +
          '```\n' + upliftCommand + '\n```',
    assignee: pull.user.login,
  });
  log.verbose(`Created Issue #${newissue.number}`);

  // Now that the uplift issue has been created and assigned to the owner of the
  // original PR, remove the upliftApprovedLabel to avoid trying to uplift it
  // again.
  await sharedRepo.issues(pr).labels(upliftApprovedLabel).remove();

  // Cherry-pick the PR commits into the new branch
  let convertIssueToPull = false;

  const halp = `\n@${pull.user.login}, please help by manually performing ` +
    'the uplift using the above instructions as a guide, and sending a ' +
    'Pull Request to resolve this issue.';

  if (foundMergeCommit) {
    sharedRepo.issues(newissue.number).comments.create({
      'body': `:no_good: #${pr} contains merge commits, manual uplift is required. ${halp}`,
    });
  } else {
    log.verbose(`Starting uplift: ${upliftCommand}`);
    const upliftResult = await new Promise((resolve) => {
      child_process.exec(`( ./bin/preinstall && ${upliftCommand} ) 2>&1`,
        { timeout: 60 * 1000 }, // 1 minute should be more then enough
        (err, stdout, stderr) => resolve({err, stdout, stderr}),
      );
    });

    let upliftComment;
    if (upliftResult.err) {
      upliftComment = ':umbrella: **Failure**\n```json\n' + JSON.stringify(upliftResult.err, null, 2) + '\n```\n';
    } else {
      convertIssueToPull = true;
      upliftComment = ':sunny:\n';
    }

    if (upliftResult.stdout) {
      upliftComment += '\n```\n' + upliftResult.stdout.toString() + '```\n';
    }
    if (upliftResult.stderr) {
      upliftComment += 'Standard Error\n```\n' + upliftResult.stderr.toString() + '```\n';
    }

    if (upliftResult.err) {
      upliftComment += halp;
    }

    log.info(`Uplift result: ${upliftComment}`);
    sharedRepo.issues(newissue.number).comments.create({
      'body': upliftComment,
    });
  }

  // Convert the Issue into a Pull Request on success
  if (convertIssueToPull) {
    let newpull = await sharedRepo.pulls.create({
      issue: newissue.number,
      head: 'silk-stooge:' + upliftPrBranchName,
      base: destBranch,
    });
    log.verbose(`Created PR #${newpull.number}`);

    await sharedRepo.issues(newpull.number).update({
      labels: ['automerge'],
    });
  }
  return true;
}


/**
 * Searches the specified repo for recently closed Pull Requests into the
 * 'master' branch, and tries to uplift them to `next`
 */
async function checkRepoForUplifts(
  owner: string,
  repo: string
): Promise<void> {
  log.info(`Checking ${owner}:${repo} for PRs needing an uplift`);
  let sharedRepo = octo.repos(owner, repo);

  // Fetch recent closed PRs on the master branch
  let pulls = await sharedRepo.pulls.fetch({
    state: 'closed',
    base: 'master',
    sort: 'updated',
    direction: 'desc',
  });

  let checkPulls = async (pulls) => {
    for (let pull of pulls) {
      const updatedAtMs = Math.abs(
        Date.now() - pull.updatedAt.getTime());


      // Only consider PRs updated in the last 12 hours
      if (updatedAtMs / (60 * 60 * 1000) >= 12) {
        return;
      }
      await attemptUplift(owner, repo, pull.number);
    }

    if (pulls.nextPage) {
      await checkPulls(await pulls.nextPage());
    }
  };
  await checkPulls(pulls);
}

if (require.main === module) {
  (async function main() {
    for (let repo of silkrepos) {
      try {
        await checkRepoForUplifts('silklabs', repo);
      } catch (err) {
        log.error(err.stack);
      }
    }
  })();
}
