/**
 * Triggers the Travis CI jobs that update the silk-device repocache tarballs on
 * S3
 *
 * @flow
 */

import makeLog from 'silk-log';
const log = makeLog('main');

const buildList = [
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
    message: 'base.msm8916 next build',
    branch: 'next',
    config: {
      os: [ 'linux' ],
      env: {
        matrix: [ 'GONK_SPEC=base.msm8916' ],
      },
    },
  },
];

/////////////////////////////////////////////////////////////////////////////

import { triggerBuild } from './travis';
import { triggerBuildForProject } from './github-travis-integration';

async function main() {
  try {
    for (const { repo, project, message, branch, config } of buildList) {
      let result;
      if (project) {
        let request = {
          project,
          travis_yml: `${project}/.travis.yml`,
          message,
          branch,
          config,
        };
        result = await triggerBuildForProject('silklabs', repo, request);
      } else {
        result = await triggerBuild('silklabs', repo, {message, branch, config});
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
