/**
 * @flow
 */

import invariant from 'assert';
import {NativeModules, DeviceEventEmitter} from 'react-native';
import makeLog from 'silk-log';
import RobustEventEmitter from 'silk-utils/robust_event_emitter';

import type EventEmitter from 'events';

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
type InRangeMessage = {
  inRange: boolean;
};
type BeaconingMessage = {
  serviceUuid: string;
  deviceNumber: number;
  beaconing: boolean;
};
type EndMessage = ConnectMessage;
type DisconnectMessage = ConnectMessage;

const log = makeLog(`btle-SocketManager`);

const {BLESocketManager} = NativeModules;

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
export class Socket extends RobustEventEmitter {

  _id: number;

  constructor(id: number) {
    log.debug(`Socket(${id})`);

    super();

    this._id = id;
  }

  get id(): number {
    return this._id;
  }

  send(data: Buffer) {
    log.debug(`Socket.send(${data.length})`);
    invariant(singletonInstance);
    singletonInstance.send(this._id, data);
  }

  enableRssiUpdates(enable: boolean) {
    log.debug(`Socket.updateRssi(${String(enable)})`);
    invariant(singletonInstance);
    singletonInstance.enableRssiUpdates(this._id, enable);
  }

  finish() {
    log.debug(`Socket.finish()`);
    invariant(singletonInstance);
    singletonInstance.finish(this._id);
  }

  disconnect() {
    log.debug(`Socket.disconnect()`);
    invariant(singletonInstance);
    singletonInstance.disconnect(this._id);
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
export class SocketManager extends RobustEventEmitter {
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
    DeviceEventEmitter.addListener('silk-blesocketmanager-end',
                                   this.onEnd);
    DeviceEventEmitter.addListener('silk-blesocketmanager-disconnect',
                                   this.onDisconnect);
    DeviceEventEmitter.addListener('silk-blesocketmanager-unconfigured-devices',
                                   this.onUnconfiguredDevicesInRange);
    DeviceEventEmitter.addListener('silk-blesocketmanager-devices-beaconing',
                                   this.onDevicesBeaconing);
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

  onEnd: ((args: EndMessage) => void) = (args) => {
    const id = args.id;
    log.debug(`SocketManager.onEnd(${id})`);

    let socket = this._sockets.get(id);
    if (socket) {
      socket.emit('end');
    } else {
      log.info(`End received for connection ${id} that no longer exists, ` +
               `ignoring`);
    }
  };

  onDisconnect: ((args: DisconnectMessage) => void) = (args) => {
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

  onUnconfiguredDevicesInRange: ((args: InRangeMessage) => void) = (args) => {
    const {inRange} = args;
    log.debug(`SocketManager.onUnconfiguredDevicesInRange(${inRange})`);

    // TODO: Something smarter here.
    process.nextTick(() =>
      BLESocketManager.scanForUnconfiguredDevices(inRange));
  };

  onDevicesBeaconing: ((args: BeaconingMessage) => void) = (args) => {
    const {
      serviceUuid,
      deviceNumber,
      beaconing,
    } = args;
    log.debug(`SocketManager.onDevicesBeaconing('${serviceUuid}', ` +
              `${deviceNumber}, ${beaconing})`);

    const eventName = beaconing ? `beacon-started` : `beacon-stopped`;
    this.emit(eventName, serviceUuid, deviceNumber);
  };

  send(id: number, data: Buffer) {
    log.debug(`SocketManager.send(${id}, ${data.length})`);

    invariant(this._sockets.has(id));

    BLESocketManager.send(id, data.toString('base64'));
  }

  enableRssiUpdates(id: number, enable: boolean) {
    log.debug(`SocketManager.updateRssi(${id}, ${String(enable)})`);

    if (this._sockets.has(id)) {
      BLESocketManager.enableRssiUpdates(id, enable);
    }
  }

  finish(id: number) {
    log.debug(`SocketManager.finish(${id})`);

    invariant(this._sockets.has(id));

    BLESocketManager.finish(id);
  }

  disconnect(id: number) {
    log.debug(`SocketManager.disconnect(${id})`);

    if (this._sockets.has(id)) {
      BLESocketManager.disconnect(id);
    }
  }
}

export default function getSocketManager(): EventEmitter {
  if (!singletonInstance) {
    singletonInstance = new SocketManager();
  }

  let emitter = new RobustEventEmitter();
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
