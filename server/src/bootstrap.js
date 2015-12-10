/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import loadConfig from './server/config';
import version from 'silk-core-version';

import v8 from 'v8';
v8.setFlagsFromString('--trace_gc'); 
//v8.setFlagsFromString('--trace_gc_verbose');

export default function(createServer) {
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
