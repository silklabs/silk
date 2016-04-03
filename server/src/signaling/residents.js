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
import uuid from 'uuid';
import createLog from 'silk-log';
import WebSocket from 'ws';

const log = createLog('signaling:residents');

const CLIENT_MESSAGE = 0;
const CLIENT_CLOSE = 1;


type ClientConfig = {
  timeoutMs: number;
}

type ResidentConfig = {
  checkIntervalMs: number;
  pingIntervalMs: number;
  pongTimeoutMs: number;
};

type Client = {
  connectedAt: number;
  connection: any; // ws websocket ...
};

type Resident = {
  // Which client we are currently handling.
  currentId: ?string;
  lastPong: number;
  lastPing: number;

  connection: any;
  // unique id to connection.
  clients: Map<string, Client>;
};

function header(type = CLIENT_CLOSE | CLIENT_MESSAGE, data: Buffer): Buffer {
  return Buffer.concat([
    new Buffer([type]),
    data
  ]);
}

export default class Residents {

  _clients: Set<Client> = new Set();
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

  /**
   * Keep track of a particular websocket connection. The residents are long
   * lived.
   */
  register(id: string, connection: any) {
    const now = Date.now();
    const resident = {
      lastPing: now,
      lastPong: now,
      currentId: null,
      connection,
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
      connection.removeListener('close', onClose);
      connection.removeListener('error', onClose);
      connection.removeListener('message', onMessage);
      connection.removeListener('pong', onPong);
      connection.removeListener('ping', onPing);
    };

    const onPong = () => {
      log.info(`Got pong for resident: ${id}....`);
      resident.lastPong = Date.now();
    };

    const onPing = () => {
      log.info(`Got ping for resident: ${id} sending pong`);
      connection.pong();
    };

    const onMessage = (data, flags) => {
      if (!flags.binary) {
        log.error(`Resident ${id} attempted to send non-binary data...`);
        connection.terminate();
        cleanup();
        return;
      }

      if (!resident.currentId) {
        if (data.length !== 16) {
          log.error(`Resident sent invalid id length: ${data.length}`);
          connection.terminate();
          return;
        }
        resident.currentId = data.toString('hex');
        return;
      }

      const streamId = resident.currentId;
      let client = resident.clients.get(streamId);
      if (!client) {
        log.warn(`Attempting to send data to unknown dest: ${streamId}`);
        return;
      }
      log.info(`(resident) Sending data from ${id} to ${streamId}`);
      resident.currentId = null;

      if (client.connection.readyState !== WebSocket.OPEN) {
        log.error(`Resident ${id} sending messgaes to closed client: ${streamId}`);
        return;
      }

      client.connection.send(data);
    };

    const onClose = () => {
      cleanup();
    };

    const onError = (err) => {
      log.error(`Error encountered with resident connection: ${err.stack}`);
      cleanup();
    };

    connection.on('error', onError);
    connection.on('close', onClose);
    connection.on('message', onMessage);
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
  bridge(id: string, connection: any) {
    const streamIdBinary = uuid.v4({}, new Buffer(16));
    const streamId = streamIdBinary.toString('hex');
    const resident = this._residents.get(id);

    if (!resident) {
      throw new Error(`Attempted to bridge to unknown resident`);
    }

    if (resident.clients.has(streamId)) {
      connection.terminate();
      throw new Error('uuid collision (should never happen)');
    }

    log.info(`Connect client (${streamId}) to ${id}`);

    const client = {
      connectedAt: Date.now(),
      connection,
    };

    const onMessage = (data, flags) => {
      if (!flags.binary) {
        log.warn(`Client attempted to send non-binary data...`);
        connection.terminate();
        cleanup();
        return;
      }

      log.info(`(client) Sending data to ${id} from ${streamId}`);

      if (resident.connection.readyState > WebSocket.OPENED) {
        log.warn(`Terminating client during message since resident has closed.`);
        return;
      }

      // Each "send" call maps directly to a frame and we are single threaded
      // which avoids race conditions in the order of our frames.
      try {
        resident.connection.send(header(CLIENT_MESSAGE, streamIdBinary));
        resident.connection.send(data);
      } catch (err) {
        // Either we are already disconnected or some other error which will get
        // resolved by the error/close handlers.
        log.error(`Error writing to resident ${id} ${err.stack}`);
        return;
      }
    };

    const onClose = () => {
      cleanup();
    };

    const onError = (err) => {
      log.warn(`Error encountered during bridge: ${err.stack}`);
      cleanup();
    };

    const cleanup = () => {
      log.info(`Disconnect client (${streamId})`);
      connection.removeListener('message', onMessage);
      connection.removeListener('close', onClose);
      connection.removeListener('error', onError);
      resident.clients.delete(streamId);
      this._clients.delete(client);

      // send a message to initiate close on the resident side.
      if (resident.connection.readyState === WebSocket.OPEN) {
        log.info(`Notify resident (${id}) of stream close ${streamId}`);
        resident.connection.send(header(CLIENT_CLOSE, streamIdBinary));
      }
    };

    this._clients.add(client);
    resident.clients.set(streamId, client);
    connection.on('message', onMessage);
    connection.on('close', onClose);
    connection.on('error', onError);
  }
}
