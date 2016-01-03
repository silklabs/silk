
import createLog from 'log';
import Octokat from 'octokat'; // Ref: https://www.npmjs.com/package/octokat

const log = createLog('github-tool');

if (!process.env.GITHUB_TOKEN) {
  throw new Error('GITHUB_TOKEN environment variable undefined');
}

let octo = new Octokat({
  token: process.env.GITHUB_TOKEN,
});


function forEachSilkRepo(f) {
  var repos = require('./repos');
  return repos.reduce(
    (promise, repo) => {
      return promise.then(() => {
        return f('silklabs', repo);
      });
    },
    Promise.resolve()
  );
}


function maybeCreatePullRequest(destOwner, destRepo, destBranch, sourceBranch) {
  var r = octo.repos(destOwner, destRepo);

  log.info(`Fetching pull requests for ${destOwner}/${destRepo}...`);

  return new Promise((resolve, reject) => {
    var checkForActivePr = pulls => {
      log.info(`(Found ${pulls.length} pull requests)`);
      var activePr = pulls.find((pr) => pr.head.ref === sourceBranch);
      if (activePr) {
        log.info(`Open pull request for branch ${sourceBranch} already exists: ${activePr.number}`);
        return reject(undefined);
      }
      if (pulls.nextPage) {
        log.info('Fetching more pull requests...');
        return pulls.nextPage()
        .then(checkForActivePr)
        .catch(reject);
      }
      return resolve();
    };
    r.pulls.fetch({base: destBranch})
    .then(checkForActivePr)
    .catch(reject);
  })
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
      var json = err.json;
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
    log.info(`Succesfully added 'automerge' label to pull request.`);
  })
  .catch(err => {
    if (err) {
      return Promise.reject(err);
    }
    return Promise.resolve();
  });
}


function maybeCreateAllRepoPullRequests(destBranch, sourceBranch) {
  return forEachSilkRepo((owner, repo) =>
    maybeCreatePullRequest(owner, repo, destBranch, sourceBranch));
}


function createMilestone(owner, repo, title, dueDate) { //eslint-disable-line no-unused-vars
  var r = octo.repos(owner, repo);
  log.info(`Creating milestone: ${title}, due_on: ${dueDate.toISOString()} for ${owner}/${repo}`);
  return r.milestones.create({
    'title': title,
    'due_on': dueDate.toISOString(),
  });
}


export function autoMergePullRequest(owner, repo, pr) {
  log.info(`#${pr}: fetching info`);
  var r = octo.repos(owner, repo);

  return r.issues(pr).fetch().then(result => {
    log.debug(`#${pr} title: ${result.title}`);
    log.debug(`#${pr} number: ${result.number}`);
    log.debug(`#${pr} state: ${result.state}`);

    if (!result.pullRequest) {
      log.info(`#${pr}: this is an issue, not a pull request.`);
      return Promise.reject();
    }

    if (result.state !== 'open') {
      log.info(`PR #${pr}: pull request is not open.`);
      return Promise.reject();
    }

    var label = result.labels.find(label => {
      return label.name === 'automerge';
    });
    if (!label) {
      log.info(`PR #${pr}: missing the 'automerge' label.`);
      return Promise.reject();
    }
    log.debug(`PR #${result.number}: fetching info`);
    return r.pulls(result.number).fetch(); // Switch to the 'pull' API to get CI status
  })
  .then(result => {
    if (result.mergeable === null) {
      // Ref: https://developer.github.com/v3/pulls/#response-1
      log.info(`PR #${result.number}: mergeable state is not yet known.`);
      return Promise.reject();
    }

    if (result.mergeable === false) {
      log.info(`PR #${result.number}: not mergeable.`);
      return r.issues(result.number).comments.create({
        'body': ':broken_heart: Unable to automerge due to merge conflict',
      }).then(() => {
        return r.issues(result.number).labels('automerge').remove();
      });
    }

    log.debug(`PR #${result.number}: fetching CI status for head SHA ${result.head.sha}`);
    // Check the CI status of the head SHA
    return new Promise((resolve, reject) => {
      r.commits(result.head.sha).status.fetch()
      .then(status => {
        log.info(`PR #${result.number}: CI status: ${status.state}`);

        switch (status.state) {
        case 'success':
          log.info(`PR #${result.number}: CI status is success, trying to merge...`);
          r.pulls(result.number).merge.add({
            sha: result.head.sha,
            commit_message: 'automerge',
          })
          .then(mergeResult => {
            log.info(`PR #${result.number}: successfully merged: ${mergeResult}`);
            return resolve();
          })
          .catch(reject);
          break;

        case 'failure':
          log.info(`PR #${result.number}: CI status is failure, not going to merge.`);
          r.issues(result.number).comments.create({'body': ':broken_heart: Unable to automerge due to CI failure'})
          .then(() => {
            r.issues(result.number).labels('automerge').remove();
          })
          .then(resolve);
          break;

        default:
          return resolve();
        }
      })
      .catch(reject);
    });
  })
  .catch(err => {
    if (err) {
      return Promise.reject(err);
    }
    return Promise.resolve();
  });
}


function forAllOpenPullRequests(owner, repo, cb) {
  var r = octo.repos(owner, repo);

  log.info(`Fetching pull requests for ${owner}/${repo}...`);

  return new Promise((resolve, reject) => {
    var checkPulls = pulls => {
      log.info(`(Found ${pulls.length} pull requests)`);

      pulls.reduce(
        (promise, pr) => {
          return promise.then(() => cb(pr));
        },
        Promise.resolve()
      ).then(() => {
        if (pulls.nextPage) {
          log.info(`Fetching more pull requests...`);
          return pulls.nextPage()
          .then(checkPulls)
          .catch(reject);
        }
        return resolve();
      })
      .catch(reject);
    };

    r.pulls.fetch()
    .then(checkPulls)
    .catch(reject);
  });
}


export function autoMergePullRequests(owner, repo) {
  log.info(`autoMergePullRequests for ${owner}/${repo}...`);
  return forAllOpenPullRequests(owner, repo, prInfo => {
    return autoMergePullRequest(owner, repo, prInfo.number);
  });
}


function handleCommitsPushedToPullRequest(owner, repo, pr) {
  log.debug(`PR #${pr}: fetching info`);
  let r = octo.repos(owner, repo);

  return r.issues(pr).fetch().then(result => {
    let automerge = result.labels.find(label => {
      return label.name === 'automerge';
    });

    if (!automerge) {
      log.debug(`PR #${pr}: no automerge label, ignoring.`);
      return Promise.resolve();
    }

    log.info(`PR #${pr}: new commits were pushed while 'automerge' label was present.`);
    return r.issues(pr).comments.create({
      'body': ':scream: New commits were pushed while the automerge label was present.',
    }).then(() => {
      return r.issues(pr).labels('automerge').remove();
    });
  });
}


export function handlePullRequestAction(owner, repo, pr, action) {
  if (action === 'synchronize') {
    log.info(`PR #${pr}: new commits were pushed`);
    return handleCommitsPushedToPullRequest(owner, repo, pr);
  }

  log.info(`PR #${pr}: checking if it should be automerged`);
  return autoMergePullRequest(owner, repo, pr);
}


function exitOnError(err) {
  if (err) {
    log.error('Error', err, err.stack);
    process.exit(1); //eslint-disable-line no-process-exit
  }
}


// next2master is currently unused and could be removed in the future
function next2master() {  //eslint-disable-line no-unused-vars
  Promise.resolve()
  .then(() => maybeCreateAllRepoPullRequests('master', 'next'))
  .catch(exitOnError)
  .then(() => {
    log.info('SUCCESS');
  });
}


// TODO: Convert this to a command-line option or something...
/*
function genMilestones(prefix, number = 5, baseDate, baseNumber = 1,
  incNumber = 1, incDate = 14) {
  let m = [];

  while (number >= 1) {
    let date = new Date();
    date.setTime(baseDate.getTime());
    m.push([`${prefix}${baseNumber}`, date]);

    baseDate.setTime(baseDate.getTime() + 1000 * 60 * 60 * 24 * incDate);
    baseNumber += incNumber;
    number--;
  }
  return m;
}

if (require.main === module) {
  Promise.resolve()
  .then(() => {
    let milestones = genMilestones('Feature', 6, new Date(2016, 0, 8));
    return Promise.all(
      milestones.map(m => createMilestone('silklabs', 'silk-core', m[0], m[1]))
    )
  })
  .catch(exitOnError)
  .then(() => {
    console.log('SUCCESS');
  });
}
*/
