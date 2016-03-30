/**
 * @flow
 */

import cors from 'cors';
import eventToPromise from 'event-to-promise';
import express from 'express';
import http from 'http';
import path from 'path';
import url from 'url';
import devAccount from 'silk-api/src/dev_account';
import createLog from 'silk-log';
import getHostname from '../get_hostname';

import createDb from './db';
import createS3Blob from './blobs/s3';
import createAliyunBlob from './blobs/aliyun';
import createFileBlob from './blobs/file';
import jsonParser from './json';
import createRoutes from './routes';
import CrashMetadata from './models/crash_metadata';
import TimeMetadata from './models/time_metadata';
import Accounts from './models/accounts';
import Devices from './models/devices';
import Nonce from './models/nonce';
import EmailSender from './email_sender';
import InfluxDB from '../influxdb_client';
import Scopes from './scopes';
import MetricsAgent from '../metrics_agent';
import StartMetric from '../metrics/start_server';
import SasSigner from '../sas_signer';

export type RouteContext = {
  app: any;
  nonce: Nonce;
  accounts: Accounts;
  devices: Devices;
  emailSender: EmailSender;
  crashMeta: CrashMetadata;
  timeMeta: TimeMetadata,
  config: any; // TODO
  blobs: any; // TODO
  blobHandler: any; // TODO
  influxdb: ?InfluxDB,
  scopes: Scopes,
  metricsAgent: MetricsAgent,
  sasSigner: SasSigner,
};

export default async function main (config: any): any {
  const app = express();
  const server = http.createServer(app);
  const log = createLog('server');

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

  let blobs = {
    aliyun: null,
    s3: null,
    file: await createFileBlob(config)
  };

  if (config.server.blobType === 's3') {
    blobs.s3 = await createS3Blob(config);
  } else if (config.server.blobType === 'aliyun') {
    blobs.aliyun = await createAliyunBlob(config);
  }

  const blobHandler = blobs[config.server.blobType];
  if (!blobHandler) {
    throw new Error(`Unknown blob handler type: ${config.server.blobType}`);
  }

  let db = await createDb(config);
  let crashMeta = new CrashMetadata(db, blobHandler);
  let timeMeta = new TimeMetadata(db, blobHandler);
  let nonce = new Nonce(db);
  let accounts = new Accounts(db);
  let devices = new Devices(db);

  // Ensure we have indexed models. It's safe to run these concurrently.
  await Promise.all([
    crashMeta,
    timeMeta,
    nonce,
    accounts,
  ].map(model => model.ensureIndexes()));

  // Create the developer account...
  await accounts.ensureDevAccount(devAccount);

  let emailSender = new EmailSender(config);
  let scopes = new Scopes(config.scopes);
  let metricsAgent =
    new MetricsAgent('server');
  let sasSigner = new SasSigner(config.azure);

  let influxdb = null;
  if (config.metrics.influxdb.connectionString) {
    influxdb = new InfluxDB(config.metrics.influxdb.connectionString);
    metricsAgent.start(influxdb);

    metricsAgent.add(new StartMetric());
  }

  const context: RouteContext = {
    app,
    nonce,
    accounts,
    devices,
    emailSender,
    crashMeta,
    timeMeta,
    config,
    blobs,
    blobHandler,
    influxdb,
    scopes,
    metricsAgent,
    sasSigner,
  };

  // Install the routes.
  createRoutes(context);

  server.listen(config.server.port);

  await eventToPromise(server, 'listening');

  if (!config.server.publicUrl) {
    const hostname = await getHostname();
    config.server.publicUrl = `http://${hostname}:${server.address().port}`;
  }

  // Configure socket.io public url for local development.
  if (!config.socketio.publicUrl) {
    let basePublicUrl: any = url.parse(config.server.publicUrl);
    basePublicUrl.port = config.socketio.port;
    // Delete host so port override will be used.
    delete basePublicUrl.host;
    config.socketio.publicUrl = url.format(basePublicUrl);
  }

  if (!config.signaling.useServiceDiscovery && !config.signaling.publicUrl) {
    let basePublicUrl: any = url.parse(config.server.publicUrl);
    basePublicUrl.port = config.signaling.port;
    // Delete host so port override will be used.
    delete basePublicUrl.host;
    config.signaling.publicUrl = url.format(basePublicUrl);
  }

  // This interface is only ever supposed to be used from tests.
  return {
    // Useful because tests bind on 0 we don't know which port we are using
    // until this is done.
    port: server.address().port,

    context,

    // Do any cleanup here that would normally happen because of the server
    // process being killed. We do this instead of closing the process mostly
    // for performance.
    close: async() => {
      await db.close();
      server.close();
    }
  };
}
