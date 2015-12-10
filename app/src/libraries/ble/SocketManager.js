/**
 * @flow
 */

import {
  NativeModules,
  DeviceEventEmitter,
} from 'react-native';
import invariant from 'assert';
import { EventEmitter } from 'events';
import makeLog from 'log';

type ConnectMessage = {
  id: number;
};
type ReceiveDataMessage = {
  id: number;
  data: string;
};
type RssiUpdateMessage = {
  id: number;
  rssi: number;
};

const log = makeLog(`btle-SocketManager`);

const { BLESocketManager } = NativeModules;

let singletonInstance = null;

// TODO: ReactNative doesn't support passing binary data in/out of JS, so we are
//       currently encoding data as base64-encoded strings. We should try to fix
//       this someday.

/**
 * This class encapsulates a simple socket. There are two events that it emits:
 *
 *   'data': Emitted when the other side has sent data. A Buffer object is
 *           passed as an argument.
 *   'disconnect': Emitted when the socket has disconnected.
 *
 * Data can be sent to the other side using the send() method.
 */
class Socket extends EventEmitter {
  _id: number;

  constructor(id: number) {
    log.debug(`Socket(${id})`);

    super();

    this._id = id;
  }

  send(data: Buffer) {
    log.debug(`Socket.send(${data.length})`);
    invariant(singletonInstance);
    singletonInstance.send(this._id, data);
  }

  updateRssi() {
    log.debug(`Socket.updateRssi()`);
    invariant(singletonInstance);
    singletonInstance.updateRssi(this._id);
  }
}

/**
 * This class manages communication between JS and the ReactNative
 * 'BLESocketManager' module. It emits two events:
 *
 *   'connect': Emitted when a new connection has been established.
 *   'disconnect': Emitted when a previous connection has terminated.
 *
 * Only one instance of this class will ever be created.
 */
class SocketManager extends EventEmitter {
  _sockets: Map<number, Socket> = new Map();

  constructor() {
    log.debug('SocketManager()');

    super();

    DeviceEventEmitter.addListener('silk-blesocketmanager-connect',
                                   this.onConnect);
    DeviceEventEmitter.addListener('silk-blesocketmanager-data',
                                   this.onData);
    DeviceEventEmitter.addListener('silk-blesocketmanager-rssi',
                                   this.onRssiUpdate);
    DeviceEventEmitter.addListener('silk-blesocketmanager-disconnect',
                                   this.onDisconnect);
  }

  onConnect: ((args: ConnectMessage) => void) = (args) => {
    const id = args.id;
    log.debug(`SocketManager.onConnect(${id})`);

    invariant(!this._sockets.has(id));

    let socket = new Socket(id);
    this._sockets.set(id, socket);

    this.emit('connect', socket);
  };

  onData: ((args: ReceiveDataMessage) => void) = (args) => {
    const { id, data } = args;
    log.debug(`SocketManager.onData(${id}, ${data.length})`);

    let socket = this._sockets.get(id);
    if (socket) {
      socket.emit('data', new Buffer(data, 'base64'));
    } else {
      log.info(`Data received for connection ${id} that no longer exists, ` +
               `ignoring`);
    }
  };

  onRssiUpdate: ((args: RssiUpdateMessage) => void) = (args) => {
    const { id, rssi } = args;
    log.debug(`SocketManager.onRssiUpdate(${id}, ${rssi})`);

    let socket = this._sockets.get(id);
    if (socket) {
      socket.emit('rssiUpdate', rssi);
    } else {
      log.info(`RSSI update received for connection ${id} that no longer ` +
               `exists, ignoring`);
    }
  };

  onDisconnect: ((args: ConnectMessage) => void) = (args) => {
    const id = args.id;
    log.debug(`SocketManager.onDisconnect(${id})`);

    let socket = this._sockets.get(id);
    if (socket) {
      this._sockets.delete(id);
      socket.emit('disconnect');
      this.emit('disconnect', socket);
    } else {
      log.info(`Disconnect received for connection ${id} that no longer ` +
               `exists, ignoring`);
    }
  };

  send(id: number, data: Buffer) {
    log.debug(`SocketManager.send(${id}, ${data.length})`);

    invariant(this._sockets.has(id));

    BLESocketManager.send(id, data.toString('base64'));
  }

  updateRssi(id: number) {
    log.debug(`SocketManager.updateRssi(${id})`);

    invariant(this._sockets.has(id));

    BLESocketManager.updateRssi(id);
  }
}

export type { Socket, SocketManager };

export default function getSocketManager(): EventEmitter {
  if (!singletonInstance) {
    singletonInstance = new SocketManager();
  }

  let emitter = new EventEmitter();
  emitter.on('newListener', (event, listener) => {
    invariant(singletonInstance);
    singletonInstance.addListener(event, listener);
  });
  emitter.on('removeListener', (event, listener) => {
    invariant(singletonInstance);
    singletonInstance.removeListener(event, listener);
  });

  return emitter;
}
