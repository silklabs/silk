
import loadConfig from './server/config';
import version from 'silk-core-version';
import raygun from 'silk-raygun/node';

import v8 from 'v8';
v8.setFlagsFromString('--trace_gc');
//v8.setFlagsFromString('--trace_gc_verbose');

export default function(createServer) {
  if (version.official) {
    // Enable crash reporting as early as practical
    raygun.enable('server', version.semver, {
      exceptionHandlers: true,
      customData: {
        version,
      },
    });
  }

  let log = require('log')('main');
  let profile = process.argv[2];
  let config = loadConfig(profile);

  createServer(config).then(() => {
    log.info(`${version.branch} server ${version.semver} is running at localhost:${config.server.port}`);
  }).catch((e) => {
    // Allow error to be thrown...
    setTimeout(() => {
      throw e;
    });
  });
}
