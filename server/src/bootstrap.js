/**
 * @flow
 */
import {timeout} from 'silk-async-utils';
import createLog from 'silk-log';
import version from 'silk-core-version';
import raygun from 'silk-raygun/node';

import loadConfig from './server/config';

export type ServerResult = {
  close: () => Promise<void>;
};

export type ServerFn = () => Promise<ServerResult>;

const CLOSE_TIMEOUT_MS = 10 * 1000;

export default function(createServer: ServerFn) {
  if (version.official) {
    // Enable crash reporting as early as practical
    raygun.enable('server', version.semver, {
      exceptionHandlers: true,
      customData: {
        version,
      },
    });
  }

  const log = createLog('main');
  let profile = process.argv[2];
  let config = loadConfig(profile);

  createServer(config).then((server) => {
    log.info(`${version.branch} server ${version.semver} is running at localhost:${config.server.port}`);

    const handleExit = async () => {
      try {
        await Promise.race([
          timeout(CLOSE_TIMEOUT_MS, new Error('Timed out while waiting for close')),
          server.close(),
        ]);
      } catch (err) {
        log.info(`Failed to exit cleanly:`, err.stack);
      } finally {
        process.exit(1); // eslint-disable-line no-process-exit
      }
    };

    process.on('SIGINT', async () => {
      log.info('Handling SIGINT ...');
      await handleExit();
    });

    process.on('SIGTERM', async () => {
      log.info('Handling SIGTERM ...');
      await handleExit();
    });
  }).catch((e) => {
    // Allow error to be thrown...
    setTimeout(() => {
      throw e;
    });
  });
}
