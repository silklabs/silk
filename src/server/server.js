/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import createDb from './db';
import eventToPromise from 'event-to-promise';
import createS3Blob from './blobs/s3';
import createFileBlob from './blobs/file';

import CrashMetadata from './models/crash_metadata';
import TimeMetadata from './models/time_metadata';

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
  let crashMeta = new CrashMetadata(config, db);
  let timeMeta = new TimeMetadata(db);
  let blobs = {
    file: await createFileBlob(config)
  };

  if (config.server.blobType === 's3') {
    blobs.s3 = await createS3Blob(config);
  }

  // Install the routes.
  require('./routes')({
    app,
    accounts,
    crashMeta,
    timeMeta,
    config,
    blobs
  });

  // Install the socket.io listeners.
  require('./socketio')(io);

  http.listen(config.server.port);
  let errorEvent = eventToPromise(http, 'error').then(err => {
    throw err;
  });

  let connected = eventToPromise(http, 'listening').then(() => {
    // XXX: This is sorta a hack and only intended for development/testing...
    if (!config.server.publicUrl) {
      config.server.publicUrl = `http://localhost:${http.address().port}`;
    }
  });

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
      await db.close();
      http.close();
    }
  };
}
