/**
 * Triggers the Travis CI jobs that update the silk-device repocache tarballs on
 * S3
 *
 * @flow
 */

import makeLog from 'log';
const log = makeLog('main');

const buildList = [
  {
    repo: 'silk-core',
    project: 'device',
    message: 'qemu master build',
    branch: 'master',
    config: {
      os: [ 'linux' ],
      env: {
        matrix: [ 'GONK_SPEC=qemu' ],
      },
    },
  },
  {
    repo: 'silk-core',
    project: 'device',
    message: 'qemu next build',
    branch: 'next',
    config: {
      os: [ 'linux' ],
      env: {
        matrix: [ 'GONK_SPEC=qemu' ],
      },
    },
  },
  {
    repo: 'silk-core',
    project: 'device',
    message: 'hammerhead master build',
    branch: 'master',
    config: {
      os: [ 'linux' ],
      env: {
        matrix: [ 'GONK_SPEC=hammerhead' ],
      },
    },
  },
  {
    repo: 'silk-core',
    project: 'device',
    message: 'Dragonboard 410c master build',
    branch: 'master',
    config: {
      os: [ 'linux' ],
      env: {
        global: [
          'GONK_REPO=git@github.com:silklabs/gonk-410c.git',
        ],
        matrix: [
          'GONK_SPEC=410c',
        ],
      },
    },
  },
  {
    repo: 'silk-core',
    project: 'device',
    message: 'OS X base build',
    branch: 'master',
    config: {
      os: [ 'osx' ],
      env: {
        matrix: [ 'GONK_SPEC=base' ],
      },
    },
  },
  {
    repo: 'silk-core',
    project: 'device',
    message: 'base.msm8916 master build',
    branch: 'master',
    config: {
      os: [ 'linux' ],
      env: {
        matrix: [ 'GONK_SPEC=base.msm8916' ],
      },
    },
  },
  {
    repo: 'silk-core',
    project: 'device',
    message: 'base.msm8916 next build',
    branch: 'next',
    config: {
      os: [ 'linux' ],
      env: {
        matrix: [ 'GONK_SPEC=base.msm8916' ],
      },
    },
  },
  {
    repo: 'silk-core',
    project: 'releng',
    message: 'Updating repocache for base gonk',
    branch: 'master',
    config: {
      os: ['linux', 'osx'],
      env: {
        global: [
          'S3DEPLOY=true',
          'GONK=base',
        ],
        matrix: [],
      },
      script: './travis/script_repocache',
    },
  },
  {
    repo: 'silk-core',
    project: 'releng',
    message: 'Updating repocache for mako gonk',
    branch: 'master',
    config: {
      os: ['linux'],
      env: {
        global: [
          'S3DEPLOY=true',
          'GONK=mako',
        ],
        matrix: [],
      },
      script: './travis/script_repocache',
    },
  },
  {
    repo: 'silk-core',
    project: 'releng',
    message: 'Updating repocache for qemu gonk',
    branch: 'master',
    config: {
      os: ['linux'],
      env: {
        global: [
          'S3DEPLOY=true',
          'GONK=qemu',
        ],
        matrix: [],
      },
      script: './travis/script_repocache',
    },
  },
];

/////////////////////////////////////////////////////////////////////////////

import { triggerBuild } from './travis';
import { triggerBuildForProject } from './github-travis-integration';

async function main() {
  try {
    for (const { repo, project, message, branch, config } of buildList) {
      let request = { message, branch, config };
      let result;
      if (project) {
        result = await triggerBuildForProject('silklabs', repo, project, request);
      } else {
        result = await triggerBuild('silklabs', repo, request);
      }
      log.debug(result);

      // triggerBuildForProject returns null if the specified project
      // has no `.travis.yml` of its own.
      if (!result) {
        log.error(`Invalid build: ${repo}#${branch}/${project}: ${message}`);
        continue;
      }

      if (result['@type'] !== 'pending') {
        throw new Error(result);
      }
    }

    log.info('Success');
  } catch (err) {
    log.error(err.stack);
  }
}

main();
