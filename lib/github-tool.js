
import Octokat from 'octokat'; // Ref: https://www.npmjs.com/package/octokat

if (!process.env.GITHUB_TOKEN) {
  throw new Error('GITHUB_TOKEN environment variable undefined');
}

let octo = new Octokat({
  token: process.env.GITHUB_TOKEN
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

  console.log('Fetching pull requests for ' + destOwner + '/' + destRepo + '...');

  return new Promise((resolve, reject) => {
    var checkForActivePr = pulls => {
      console.log('(Found', pulls.length, 'pull requests)');
      var activePr = pulls.find(pr => {
        return pr.head.ref === sourceBranch;
      });
      if (activePr) {
        console.log('Open pull request for branch', sourceBranch, 'already exists:', activePr.number);
        return reject(undefined);
      }
      if (pulls.nextPage) {
        console.log('Fetching more pull requests...');
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
    console.log('Creating a new pull request from the branch', sourceBranch);
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
        console.log('Nothing to merge from', sourceBranch, 'to', destBranch);
        return Promise.reject(undefined);
      }
    }
    return Promise.reject(err);
  })
  .then(result => {
    console.log('Created pull request', result.number);
    return r.issues(result.number).labels.create(['automerge']);
  })
  .then(() => {
    console.log('Succesfully labelled pull request');
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


export function autoMergePullRequest(owner, repo, pr) {
  var r = octo.repos(owner, repo);

  console.log('Fetching ' + owner + '/' + repo + '#' + pr);

  return r.issues(pr).fetch()
  .then(result => {
    console.log('Title:', result.title);
    console.log('Number:', result.number);
    console.log('State:', result.state);

    if (!result.pullRequest) {
      console.log('This issue is not a pull request.');
      return Promise.reject();
    }

    if (result.state !== 'open') {
      console.log('Pull request is not open.');
      return Promise.reject();
    }

    var label = result.labels.find(label => {
      return label.name === 'automerge';
    });
    if (!label) {
      console.log('Pull request is missing the "automerge" label.');
      return Promise.reject();
    }
    console.log('Fetching PR info for', result.number);
    return r.pulls(result.number).fetch(); // Switch to the 'pull' API to get CI status
  })
  .then(result => {
    if (result.mergeable === null) {
      // Ref: https://developer.github.com/v3/pulls/#response-1
      console.log('Pull request mergeable state is not yet known.');
      return Promise.reject();
    }

    if (result.mergeable === false) {
      console.log('Pull request is not mergeable.');
      return r.issues(result.number).comments.create({'body': ':broken_heart: Unable to automerge'})
      .then(() => {
        return r.issues(result.number).labels('automerge').remove();
      });
    }

    console.log('Fetching CI status for head SHA', result.head.sha);
    // Check the CI status of the head SHA
    return new Promise((resolve, reject) => {
      r.commits(result.head.sha).status.fetch()
      .then(status => {
        console.log('CI Status:', status.state);

        if (status.state === 'success') {
          console.log('Trying to merge...');
          r.pulls(result.number).merge.add({
            sha: result.head.sha,
            commit_message: 'automerge'
          })
          .then(mergeResult => {
            console.log('Pull Request successfully merged:', mergeResult);
            return resolve();
          })
          .catch(reject);
        } else {
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

  console.log('Fetching pull requests for ' + owner + '/' + repo + '...');

  return new Promise((resolve, reject) => {
    var checkPulls = pulls => {
      console.log('(Found', pulls.length, 'pull requests)');

      pulls.reduce(
        (promise, pr) => {
          return promise.then(() => cb(pr));
        },
        Promise.resolve()
      ).then(() => {
        if (pulls.nextPage) {
          console.log('Fetching more pull requests...');
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
  console.log('autoMergePullRequests for ' + owner + '/' + repo + '...');
  return forAllOpenPullRequests(owner, repo, pr => {
    return autoMergePullRequest(owner, repo, pr.number);
  });
}


function exitOnError(err) {
  if (err) {
    console.error('Error', err.stack);
    process.exit(1); //eslint-disable-line no-process-exit
  }
}


if (require.main === module) {
  // TODO: Add argparse and update |npm run next2master| command-line in ../package.json
  Promise.resolve()
  .then(() => maybeCreateAllRepoPullRequests('master', 'next'))
  .catch(exitOnError)
  .then(() => {
    console.log('SUCCESS');
  });
}

