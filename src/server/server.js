/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import cors from 'cors';
import createDb from './db';
import eventToPromise from 'event-to-promise';
import createS3Blob from './blobs/s3';
import createAliyunBlob from './blobs/aliyun';
import createFileBlob from './blobs/file';
import url from 'url';
import jsonParser from './json';
import devAccount from '../api/dev_account';

import CrashMetadata from './models/crash_metadata';
import TimeMetadata from './models/time_metadata';
import Accounts from './models/accounts';
import Devices from './models/devices';
import Nonce from './models/nonce';
import EmailSender from './email_sender';

export default async function main (config) {
  let express = require('express');
  let app = express();
  let http = require('http').createServer(app);
  let path = require('path');
  let log = require('log')('server');

  let publicPath = path.join(__dirname, '/../../public');

  log.info('binding to port', config.server.port);
  log.info('__dirname is', __dirname);
  log.info('cwd is', process.cwd());
  log.info('serving static files from', publicPath);

  app.set('port', config.server.port);

  let corsOptions = Object.assign({ }, config.server.cors);
  app.use(cors(corsOptions));

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
  let nonce = new Nonce(db);
  let accounts = new Accounts(db);
  let devices = new Devices(db);

  // Ensure we have indexed models...
  let index = [crashMeta, timeMeta, nonce, accounts].map(async model => {
    await model.ensureIndexes();
  });
  // It is safe to run these concurrently:
  await Promise.all(index);

  // Create the developer account...
  await accounts.ensureDevAccount(devAccount);

  let emailSender = new EmailSender(config);
  let blobs = {
    file: await createFileBlob(config)
  };

  if (config.server.blobType === 's3') {
    blobs.s3 = await createS3Blob(config);
  } else if (config.server.blobType === 'aliyun') {
    blobs.aliyun = await createAliyunBlob(config);
  }

  const context = {
    app,
    nonce,
    accounts,
    devices,
    emailSender,
    crashMeta,
    timeMeta,
    config,
    blobs
  };

  // Install the routes.
  require('./routes')(context);

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

    context,

    // Do any cleanup here that would normally happen because of the server
    // process being killed. We do this instead of closing the process mostly
    // for performance.
    close: async() => {
      await db.close();
      http.close();
    }
  };
}
