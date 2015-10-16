//
// Triggers the Travis CI jobs that update the silk-device repocache tarballs on
// S3
//

let buildList = {
  'releng' : [
    {
      message: 'Updating repocache for base gonk',
      branch: 'master',
      config: {
        os: ['linux', 'osx'],
        env: {
          global: {
            DEPLOY: 'true',
            GONK: 'base',
          },
        },
        script: './travis/script_repocache',
      }
    },
    {
      message: 'Updating repocache for mako gonk',
      branch: 'master',
      config: {
        os: ['linux'],
        env: {
          global: {
            DEPLOY: 'true',
            GONK: 'mako',
          },
        },
        script: './travis/script_repocache',
      }
    },
    {
      message: 'Updating repocache for qemu gonk',
      branch: 'master',
      config: {
        os: ['linux'],
        env: {
          global: {
            DEPLOY: 'true',
            GONK: 'qemu',
          },
        },
        script: './travis/script_repocache',
      }
    },
  ],
}

/////////////////////////////////////////////////////////////////////////////

import Travis from 'travis-ci';
import cb2promise from 'promise-callback';
import rp from 'request-promise';

if (!process.env.GITHUB_TOKEN) {
  throw new Error('GITHUB_TOKEN environment variable undefined');
}


function triggerBuild(access_token, repo, request) {
  let owner = 'silklabs';
  console.log('triggerBuild:', repo, JSON.stringify(request));

  return rp({
    url: 'https://api.travis-ci.com/repo/' + owner + '%2F' + repo + '/requests',
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Travis-API-Version': '3',
      'Authorization': 'token ' + access_token
    },
    json: true,
    body: { request }
  });
}


let travis = new Travis({version: '2.0.0', pro: true});
cb2promise(travis.auth.github.post, {
  github_token: process.env.GITHUB_TOKEN
})
.then(res => {
  console.log('Travis auth:', res);

  let builds = []
  for (let repo in buildList) {
    builds.concat(
      buildList[repo].map(
        request => triggerBuild(res.access_token, repo, request)
      )
    );
  }

  return Promise.all(builds)
})
.then(() => {
  console.log('SUCCESS');
})
.catch(err => {
  console.error(err);
});
