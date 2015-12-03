//
// Triggers the Travis CI jobs that update the silk-device repocache tarballs on
// S3
//

import makeLog from 'log';
const log = makeLog('main');

const buildList = {
  'silk-device': [
    {
      message: 'Nightly OS X base build',
      branch: 'master',
      config: {
        os: [ 'osx' ],
        env: {
          matrix: [ 'GONK_SPEC=base' ]
        },
      }
    },
    {
      message: 'Nightly base.msm8916 master build',
      branch: 'master',
      config: {
        os: [ 'linux' ],
        env: {
          matrix: [ 'GONK_SPEC=base.msm8916' ]
        },
      }
    },
    {
      message: 'Nightly base.msm8916 next build',
      branch: 'next',
      config: {
        os: [ 'linux' ],
        env: {
          matrix: [ 'GONK_SPEC=base.msm8916' ]
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
          global: [
            'DEPLOY=true',
            'GONK=base',
          ],
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
          global: [
            'DEPLOY=true',
            'GONK=mako',
          ],
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
          global: [
            'DEPLOY=true',
            'GONK=qemu',
          ],
        },
        script: './travis/script_repocache',
      }
    },
  ],
};

/////////////////////////////////////////////////////////////////////////////

import { triggerBuild } from './travis';

async function main() {
  try {
    for (const repo in buildList) {
      for (const request of buildList[repo]) {
        const result = await triggerBuild('silklabs', repo, request);
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
}

main();
