/**
 * Helper interface for dealing with the "residents" which live on a particular
 * signaling server. The intent here is to keep the list of "residents" which
 * particular clients can request a short lived session with.
 *
 * The "resident" (device) side of the connection is multiplexed such that each
 * incoming "client" (account) is given a unique id. The unique id is is sent in
 * one frame then data in another.
 *
 * @flow
 */
import invariant from 'assert';
import uuid from 'uuid';
import createLog from 'silk-log';
import WebSocket from 'ws';
import {
  MultiplexStream,
  WebSocketDuplexStream,
} from 'silk-streams';

import { VirtualStream } from 'silk-streams/src/demux';

const log = createLog('signaling:residents');

type ClientConfig = {
  timeoutMs: number;
}

type ResidentConfig = {
  checkIntervalMs: number;
  pingIntervalMs: number;
  pongTimeoutMs: number;
};

type SignalingClient = {
  connectedAt: number;
  connection: WebSocketDuplexStream;
  stream: VirtualStream;
};

type Resident = {
  // Which client we are currently handling.
  currentId: ?string;
  lastPong: number;
  lastPing: number;
  multiplex: MultiplexStream;
  connection: WebSocket;
  // unique id to connection.
  clients: Map<string, SignalingClient>;
};

export default class Residents {

  _clients: Set<SignalingClient> = new Set();
  _residents: Map<string, Resident> = new Map();
  _clientMonitorTimer: ?number;
  _residentMonitorTimer: ?number;
  _clientConfig: ClientConfig;
  _residentConfig: ResidentConfig;

  constructor(options: { residents: ResidentConfig, clients: ClientConfig }) {
    this._clientConfig = options.clients;
    this._residentConfig = options.residents;
  }

  monitorClients() {
    const config = this._clientConfig;
    // Begin monitoring clients for expired connections ....
    const check = () => {
      log.info('Checking for expired (idling) clients');
      const now = Date.now();
      for (let client of this._clients) {
        const expiry = client.connectedAt + config.timeoutMs;
        if (expiry > now) {
          // TODO: Metrics...
          log.warn('Dropping client which has been connected for longer than timeout');

          // When we terminate this client it will trigger the close or error
          // events...
          client.connection.terminate();
        }
      }

      // We use a single timer to wake up the event loop to prevent huge volumes
      // of timers running.
      this._clientMonitorTimer = setTimeout(check, config.timeoutMs);
    };

    check();
  }

  monitorResidents() {
    const config = this._residentConfig;
    const check = () => {
      const now = Date.now();
      for (let [id, resident] of this._residents.entries()) {
        const pongDelta = now - resident.lastPong;
        if (pongDelta > config.pongTimeoutMs) {
          log.warn(`Dropping resident: ${id} which has failed to respond with a pong`);
          resident.connection.terminate();
          continue;
        }

        const pingDelta = Date.now() - resident.lastPing;
        if (pingDelta > config.pingIntervalMs) {
          log.info(`Sending connection ping to resident: ${id}`);
          resident.lastPing = now;
          resident.connection.ping();
        }
      }
      this._residentMonitorTimer = setTimeout(check, config.checkIntervalMs);
    };
    check();
  }

  start() {
    log.info(`Monitoring residents and clients...`);
    this.monitorClients();
    this.monitorResidents();
  }

  stop() {
    log.info(`Monitoring residents and clients...`);
    if (this._clientMonitorTimer) {
      clearTimeout(this._clientMonitorTimer);
      this._clientMonitorTimer = null;
    }

    if (this._residentMonitorTimer) {
      clearTimeout(this._residentMonitorTimer);
      this._residentMonitorTimer = null;
    }
  }

  route(resident: Resident, stream: VirtualStream) {
    // NOTE: This is just an example it would be probably best to do the heavy
    // lifting in another file ...
    if (!stream.body.type) {
      return;
    }

    switch (stream.body.type) {
    // TODO: Remove me once we have some proper examples in here...
    case 'echo':
      log.info(`Creating echo cloud stream ...`);
      // yeah little meta...
      stream.pipe(stream);
      break;
    default:
      log.info(`Stream request without a .type`);
      stream.destroy();
      return;
    }
  }

  /**
   * Keep track of a particular websocket connection. The residents are long
   * lived.
   */
  register(id: string, connection: WebSocket) {
    const multiplex = new MultiplexStream(new WebSocketDuplexStream(connection));
    const now = Date.now();
    const resident = {
      lastPing: now,
      lastPong: now,
      currentId: null,
      connection,
      multiplex,
      clients: new Map(),
    };

    this._residents.set(id, resident);

    // TODO: ping/pongs other long lived support (lastSeen, etc...).
    const cleanup = () => {
      // terminate all connected accounts ...
      for (let client of resident.clients.values()) {
        client.connection.terminate();
      }

      log.info(`Resident disconnect (${id}) and ${resident.clients.size} clients`);

      this._residents.delete(id);

      // Multiplex consumes the errors and then spits them back out.
      multiplex.removeListener('error', onClose);
      multiplex.removeListener('data', onStream);

      connection.removeListener('close', onClose);
      connection.removeListener('pong', onPong);
      connection.removeListener('ping', onPing);
    };

    const onStream = (stream: VirtualStream) => {
      invariant(stream instanceof VirtualStream);
      this.route(resident, stream);
    };

    const onPong = () => {
      log.info(`Got pong for resident: ${id}....`);
      resident.lastPong = Date.now();
    };

    const onPing = () => {
      log.info(`Got ping for resident: ${id} sending pong`);
      connection.pong();
    };

    const onClose = () => {
      cleanup();
    };

    const onError = (err) => {
      log.error(`Error encountered with resident connection: ${err.stack}`);
      cleanup();
    };

    multiplex.on('error', onError);
    multiplex.on('data', onStream);

    connection.on('close', onClose);
    connection.on('ping', onPing);
    connection.on('pong', onPong);

    // Kick off an initial ping.
    connection.ping();

    log.info(`Finished registering resident ${id}`);
  }

  has(id: string): bool {
    return this._residents.has(id);
  }

  /**
   * Bride communications between one of the residents and an incoming
   * client. These communications are designed to be short.
   */
  bridge(id: string, connection: WebSocket) {
    const wsDuplex = new WebSocketDuplexStream(connection);
    const streamId = uuid.v4();
    const resident = this._residents.get(id);
    log.info(`Bridge(id=${id} streamId=${streamId})`);

    if (!resident) {
      throw new Error(`Attempted to bridge to unknown resident`);
    }

    if (resident.clients.has(streamId)) {
      connection.terminate();
      throw new Error('uuid collision (should never happen)');
    }

    const stream = resident.multiplex.createStream({
      type: 'signaling',
    }, `signaling stream ${streamId} -> ${id}`);

    const client = {
      connectedAt: Date.now(),
      connection: wsDuplex,
      stream,
    };

    wsDuplex.pipe(stream);
    stream.pipe(wsDuplex);

    const onClose = () => {
      cleanup();
    };

    const onError = (err) => {
      log.warn(`Error encountered during bridge: ${err.stack}`);
      cleanup();
    };

    const cleanup = () => {
      log.info(`Disconnect client (${streamId})`);
      wsDuplex.removeListener('close', onClose);
      wsDuplex.removeListener('error', onError);
      resident.clients.delete(streamId);
      this._clients.delete(client);
    };

    log.info(`Client stream ${streamId} setup for ${id}`);
    this._clients.add(client);
    resident.clients.set(streamId, client);
    wsDuplex.on('close', onClose);
    wsDuplex.on('error', onError);
  }
}
