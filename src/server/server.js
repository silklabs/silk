/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import eventToPromise from 'event-to-promise';

export default async function main (config) {
  let log = require('./log')('server');
  let express = require('express');
  let app = express();
  let http = require('http').createServer(app);
  let path = require('path');

  let publicPath = path.join(__dirname, '/../../public');

  log.info('binding to port', config.server.port);
  log.info('__dirname is', __dirname);
  log.info('cwd is', process.cwd());
  log.info('serving static files from', publicPath);

  app.set('port', config.server.port);
  app.use(express.static(publicPath));

  http.listen(config.server.port);
  let errorEvent = eventToPromise(http, 'error').then(err => {
    throw err;
  });

  let connected = eventToPromise(http, 'listening');

  // await to be connected correctly...
  await Promise.race([errorEvent, connected]);

  // This interface is only ever supposed to be used from tests.
  return {
    // Useful because tests bind on 0 we don't know which port we are using
    // until this is done.
    port: http.address().port,

    // Do any cleanup here that would normally happen because of the server
    // process being killed. We do this instead of closing the process mostly
    // for performance.
    close: async() => {
      http.close();
    }
  };
}
