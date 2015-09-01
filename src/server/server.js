/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import createDb from './db';
import eventToPromise from 'event-to-promise';
import createS3Blob from './blobs/s3';
import createFileBlob from './blobs/file';
import url from 'url';
import jsonParser from './json';

import CrashMetadata from './models/crash_metadata';
import TimeMetadata from './models/time_metadata';
import AccountsModel from './models/accounts';

export default async function main (config) {
  let express = require('express');
  let app = express();
  let http = require('http').createServer(app);
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

  // We want JSON parsing to happen for almost all requests, except when we are
  // uploading a blob to the file blob handler. This should only happen during
  // tests or while running local builds so the fact that this is a major hack
  // can hopefully be overlooked...
  if (config.server.blobType === 'file') {
    app.put('/blob/:type/:id', (req, res, next) => {
      // Setting this flag will make the body parser skip this request and leave
      // the request stream untouched.
      req._body = true;
      next();
    });
  }

  // TODO: Explicitly use middleware in prefixed paths.
  app.use(jsonParser);

  let db = await createDb(config);
  let crashMeta = new CrashMetadata(db);
  let timeMeta = new TimeMetadata(db);
  // XXX: Rename once we phase out old account interface.
  let accountsModel = new AccountsModel(db);
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
    accountsModel,
    crashMeta,
    timeMeta,
    config,
    blobs
  });

  http.listen(config.server.port);
  let errorEvent = eventToPromise(http, 'error').then(err => {
    throw err;
  });

  let connected = eventToPromise(http, 'listening').then(() => {
    // XXX: This is sorta a hack and only intended for development/testing...
    if (!config.server.publicUrl) {
      config.server.publicUrl = `http://localhost:${http.address().port}`;
    }

    // Configure socket.io public url for local development.
    if (!config.socketio.publicUrl) {
      let basePublicUrl = url.parse(config.server.publicUrl);
      basePublicUrl.port = config.socketio.port;
      // Delete host so port override will be used.
      delete basePublicUrl.host;
      config.socketio.publicUrl = url.format(basePublicUrl);
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
