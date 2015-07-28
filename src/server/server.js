/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import createDb from './db';
import TimeMetadata from './models/time_metadata';
import eventToPromise from 'event-to-promise';

export default async function main (config) {
  let express = require('express');
  let app = express();
  let http = require('http').createServer(app);
  let io = require('socket.io')(http);
  let accounts = require('./accounts')();
  let path = require('path');
  let log = require('./log')('server');

  let publicPath = path.join(__dirname, '/../../public');

  log.info('binding to port', config.server.port);
  log.info('__dirname is', __dirname);
  log.info('cwd is', process.cwd());
  log.info('serving static files from', publicPath);

  app.set('port', config.server.port);
  app.use(express.static(publicPath));

  let bodyParser = require('body-parser');
  app.use(bodyParser.json());

  let db = await createDb(config);
  let timeMeta = new TimeMetadata(db);

  // Install the routes.
  require('./routes')(app, accounts, timeMeta);
  // Install the socket.io listeners.
  require('./socketio')(io);

  http.listen(config.server.port);
  let errorEvent = eventToPromise(http, 'error').then(err => {
    throw err;
  });
  let connected = eventToPromise(http, 'listening').then(() => {
    return http;
  });
  return await Promise.race([errorEvent, connected]);
}
