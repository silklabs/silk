//
// Triggers the Travis CI jobs that update the silk-device repocache tarballs on
// S3
//

import makeLog from 'log';
const log = makeLog('silkmain');

const buildList = {
  'silk-device': [
    {
      message: 'Nightly OS X master build',
      branch: 'master',
      config: {
        os: [ 'osx' ],
        env: {
          matrix: [ 'GONK_SPEC=base' ]
        },
      }
    },
  ],

  'releng': [
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
};

/////////////////////////////////////////////////////////////////////////////

import Travis from 'travis-ci';
import cb2promise from 'promise-callback';
import rp from 'request-promise';


function triggerBuild(access_token, repo, request) {
  let owner = 'silklabs';
  log.info(`Triggering ${owner}/${repo}: ${request.message}`);
  log.debug('  ', JSON.stringify(request));

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

async function main() {
  try {
    const travis = new Travis({version: '2.0.0', pro: true});

    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN environment variable undefined');
    }

    const res = await cb2promise(travis.auth.github.post, {
      github_token: process.env.GITHUB_TOKEN
    })
    log.verbose('Travis auth:', res);

    for (const repo in buildList) {
      for (const request of buildList[repo]) {
        const result = await triggerBuild(res.access_token, repo, request);
        log.debug(result);

        if (result['@type'] !== 'pending') {
          throw new Error(result);
        }
      }
    }

    log.info('Success');
  } catch (err) {
    log.error(err.stack);
  }
};

main();
