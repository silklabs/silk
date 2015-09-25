/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import createServer from './server';
import loadConfig from './config';

let log = require('./log')('main');
let profile = process.argv[2];
let config = loadConfig(profile);

createServer(config).then(() => {
  log.info(`server is running at localhost: ${config.server.port}`);
}).catch((e) => {
  // Allow error to be thrown...
  setTimeout(() => {
    throw e;
  });
});

