import assert from 'assert';
import { EventEmitter } from 'events';
import makeLog from 'log';

const log = makeLog(`BLESocketManager`);

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
class BLESocket extends EventEmitter {
  _id = 0;

  constructor(id) {
    log.debug(`BLESocket(${id})`);

    super();

    this._id = id;
  }

  send(data) {
    log.debug(`BLESocket.send(${data.length})`);

    singletonInstance.send(this._id, data);
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
class BLESocketManager extends EventEmitter {
  _nativeManager = null;
  _sockets = new Map();

  constructor() {
    log.debug('BLESocketManager()');

    super();

    this._nativeManager =
      require('react-native').NativeModules.BLESocketManager;

    let RCTDeviceEventEmitter = require('RCTDeviceEventEmitter');

    RCTDeviceEventEmitter.addListener('silk-blesocketmanager-connect',
                                      this.onConnect);
    RCTDeviceEventEmitter.addListener('silk-blesocketmanager-data',
                                      this.onData);
    RCTDeviceEventEmitter.addListener('silk-blesocketmanager-disconnect',
                                      this.onDisconnect);
  }

  onConnect = args => {
    const id = args.id;
    log.debug(`BLESocketManager.onConnect(${id})`);

    assert(!this._sockets.has(id));

    let socket = new BLESocket(id);
    this._sockets.set(id, socket);

    this.emit('connect', socket);
  };

  onData = args => {
    const { id, data } = args;
    log.debug(`BLESocketManager.onData(${id}, ${data.length})`);

    let socket = this._sockets.get(id);
    if (socket) {
      socket.emit('data', new Buffer(data, 'base64'));
    } else {
      log.info(`Data received for connection ${id} that no longer exists, ` +
               `ignoring`);
    }
  };

  onDisconnect = args => {
    const id = args.id;
    log.debug(`BLESocketManager.onDisconnect(${id})`);

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

  send(id, data) {
    log.debug(`BLESocketManager.send(${id}, ${data.length})`);

    assert(this._sockets.has(id));

    this._nativeManager.send(id, data.toString('base64'));
  }
}

export default function getBLESocketManager() {
  if (!singletonInstance) {
    singletonInstance = new BLESocketManager();
  }

  let emitter = new EventEmitter();
  emitter.on('newListener', (event, listener) => {
    singletonInstance.addListener(event, listener);
  });
  emitter.on('removeListener', (event, listener) => {
    singletonInstance.removeListener(event, listener);
  });

  return emitter;
}
