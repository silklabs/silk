/**
 * Main signaling server interface ...
 *
 * @flow
 */

import invariant from 'assert';
import { Server as WebSocketServer } from 'ws';
import http from 'http';
import eventToPromise from 'event-to-promise';
import URL from 'url';
import createLog from 'silk-log';
import getHostname from '../get_hostname';

import {
  TableClient,
  SharedKeyAuth,
} from 'silk-azure-storage/src/table';
import CompositeTable from 'silk-azure-storage/src/composite_table';

import createDb from '../server/db';
import sha256 from '../server/sha256';
import authorizeDevice from '../server/authorize_device';
import authorizeAccount from '../server/authorize_account';
import runMiddleware from '../run_middleware';

import Devices from '../server/models/devices';
import Accounts from '../server/models/accounts';
import Nonce from '../server/models/nonce';
import InfluxDB from '../influxdb_client';
import MetricsAgent from '../metrics_agent';
import Residents from './residents';

export type RouteContext = {
  devices: Devices;
  nonce: Nonce;
  accounts: Accounts;
  host: string;
  influxdb: ?InfluxDB;
  metricsAgent: MetricsAgent;
  signalServers: CompositeTable;
  signalDevices: CompositeTable;
};

const log = createLog('signaling:server');

function signatureProvider(req: any): ?string {
  let {query} = URL.parse(req.url, true);
  return query && query.jwt;
}

async function main (config: any): any {
  const server = http.createServer(() => {} /* make flow happy */);
  const db = await createDb(config);
  const nonce = new Nonce(db);
  const devices = new Devices(db);
  const accounts = new Accounts(db);

  let metricsAgent = new MetricsAgent('signaling');

  let influxdb;
  if (config.metrics.influxdb.connectionString) {
    influxdb = new InfluxDB(config.metrics.influxdb.connectionString);
    metricsAgent.start(influxdb);
  }

  // For now we replicate to two regions for redundancy in the future we
  // should look into locking users to specific continents.
  const regionalClients = Object.keys(config.azure.regions).map((region) => {
    log.info(`Initializing azure in: ${region}`);
    const auth = new SharedKeyAuth(config.azure.regions[region]);
    return new TableClient(auth);
  });

  const signalServers = new CompositeTable(
    config.azure.tables.sigservers,
    regionalClients,
  );

  const signalDevices = new CompositeTable(
    config.azure.tables.sigdevices,
    regionalClients,
  );

  const azureTableSetup = [
    signalServers.ensureTables(),
    signalDevices.ensureTables(),
  ];

  if (config.azure.setServiceProps) {
    azureTableSetup.push(signalServers.setCorsRules(config.azure.cors));
  }

  await Promise.all(azureTableSetup);

  server.listen(config.signaling.port);
  await eventToPromise(server, 'listening');

  // At this point either we have a host and register it directly or we need
  // to create one ...
  let port = config.signaling.port || server.address().port;

  if (!config.signaling.host) {
    const hostname = await getHostname();
    config.signaling.host = `http://${hostname}`;
  }

  let host = `${config.signaling.host}:${port}`;

  const ctx: RouteContext = {
    nonce,
    devices,
    accounts,
    influxdb,
    metricsAgent,
    signalServers,
    signalDevices,
    host,
  };

  const entity = {
    // TODO: In a "real" (not heroku) cloud deployment with many signaling
    // servers in production these values should be something like hashed region
    // or something ...
    PartitionKey: sha256(host),
    RowKey: sha256(host),
    host,
    start: Date.now(),
  };

  // TODO: This logic is insufficient to handle more complicated cases where our
  // services drop off for unknown reasons (like in a spot model). This is a
  // close enough stop gap. In the future we can use "start" (and a periodic
  // update for a aliveness check) to purge dead servers.
  await signalServers.mergeOrInsertEntity(entity);

  const residents = new Residents({
    clients: config.signaling.clients,
    residents: config.signaling.residents,
  });
  residents.start();

  const auth = {
    device: authorizeDevice({ devices, nonce }, { signatureProvider }),
    account: authorizeAccount({ accounts, nonce }, { signatureProvider }),
  };

  const setup = {
    device: async (req, res) => {
      const { device } = req;
      const { accountId } = device;
      log.info(`Registering resident device for ${accountId} ${device.accessToken.publicKey}`);

      // Register this particular device with this particular server.
      // NOTE: This operation should clobber any previous references to the
      // device (which is kept unique by accountId/accessToken pair.
      const entity = {
        PartitionKey: accountId,
        RowKey: device.accessToken.publicKey,
        host: ctx.host,
        // TODO: Update this periodically ...
        lastSeen: Date.now(),
      };

      await ctx.signalDevices.mergeOrInsertEntity(entity);
    },

    account: async (req, res) => {
      const parsed = URL.parse(req.url, true);
      if (!parsed.query || !parsed.query.deviceId) {
        throw new Error('Must pass device id ...');
      }

      const { deviceId } = parsed.query;

      if (!residents.has(deviceId)) {
        log.warn(`(${req.publicKey}) requested unknown device ${deviceId}`);
        res.sendStatus(404);
        return;
      }

      // yuck ...
      req.deviceId = deviceId;
      log.info(`Connecting client to ${deviceId}`);
    }
  };

  /**
   * Verifies that the client should be allowed to connect to the websocket
   * server. It's important to note that clients will not receive the "open"
   * event until this is resolved.
   */
  async function verifyClient(req, res) {
    let parsed = URL.parse(req.url, true);
    if (!parsed) {
      throw new Error(`Invalid request url: ${req.url}`);
    }

    let {query} = parsed;
    invariant(query);
    invariant(typeof query === 'object');
    invariant(parsed.pathname);
    let type = parsed.pathname.slice(1);

    if (!(type in auth)) {
      throw new Error(`Unknown client type...`);
    }

    if (!query.jwt) {
      throw new Error('.jwt field in query string is required...');
    }

    // Semi-nasty tricks to remove .jwt from the query string and rebuild the path.
    delete query.jwt;

    let formattedUrl = URL.format({
      auth: parsed.auth || '',
      host: parsed.host || '',
      pathname: parsed.pathname || '',
      query: parsed.query || {},
    });

    if (!formattedUrl) {
      throw new Error('Formatted url invalid...');
    }

    let signUrl = URL.parse(formattedUrl);
    if (!signUrl) {
      throw new Error('After parse formatted url is invalid...');
    }

    let canonicalReq = `${signUrl.pathname}\n${req.method.toLowerCase()}`;
    // TODO: Figure how out to avoid appending to req like this...
    req.requestHash = sha256(canonicalReq);
    req.type = type;

    // Ensure the client is valid ...
    await runMiddleware(auth[type], req, res);
    // Run the setup code ...
    await setup[type](req, res);
  }

  const verifyClientHandler = async (connection, cb) => {
    let errorStatus;
    let res = {
      sendStatus(code) {
        errorStatus = code;
      }
    };
    let { req } = connection;

    try {
      await verifyClient(req, res);
      if (errorStatus) {
        cb(false, errorStatus);
        return;
      }
    } catch (err) {
      log.info(`Failed to validate client: ${err.stack}`);
      cb(null, errorStatus || 401);
      return;
    }
    cb(true);
  };

  const wss = new WebSocketServer({
    server,
    // babel 5 workaround (arity of function is not correct otherwise).
    verifyClient: (connection, cb) => {
      verifyClientHandler(connection, cb);
    },
  });

  wss.on('connection', (ws) => {
    try {
      const req = ws.upgradeReq;
      const { type, deviceId, publicKey } = req;
      invariant(type);
      log.info(`Incoming connection (${type})`);

      if (type === 'device') {
        invariant(publicKey);
        residents.register(publicKey, ws);
      } else if (type === 'account') {
        invariant(deviceId);
        residents.bridge(deviceId, ws);
      } else {
        // We check this above as well this is simply to ensure we have a catch
        // all if we hit some bugs.
        log.error(`Unknown connection type: ${type}`);
        ws.terminate();
      }
    } catch (err) {
      log.error(`Failed to handle incoming websocket req: ${err.stack}`);
      ws.terminate();
    }
  });

  // This interface is only ever supposed to be used from tests.
  return {
    // Useful because tests bind on 0 we don't know which port we are using
    // until this is done.
    port: server.address().port,

    // Do any cleanup here that would normally happen because of the server
    // process being killed. We do this instead of closing the process mostly
    // for performance.
    close: async () => {
      server.close();
    },

    // Restart the signaling server (will be bound on a new port ...)
    restart: async () => {
      const wsClose = new Promise((accept) => {
        // terminate all clients ...
        wss.close(() => {
          accept();
        });
      });
      const serverClose = eventToPromise(server, 'close');
      server.close();
      await Promise.all([serverClose, wsClose]);

      try {
        return await main(config);
      } catch (err) {
        console.log(`Failed to restart: ${err.stack}`);
        throw err;
      }
    }
  };
}

export default main;
