let {
  DeviceEventEmitter,
  NativeModules
} = require('react-native')

// React-Native event emitter...
import EventEmitter from 'EventEmitter';

let SocketIONative = NativeModules.SocketIO;
let NativeBlobBridge = NativeModules.BlobBridge;

class NativeBlob {
  constructor(data) {
    this.data = data;
  }

  release() {
    NativeBlobBridge.release(this.data.id);
  }

  toJSON() {
    return this.data;
  }
}

/**
Construct one of our custom types given the name of the type and a payload.
*/
function createNativeType(type, payload) {
  switch (type) {
    case 'NSData':
      return new NativeBlob(payload)
    default:
      throw new Error(`Unknown custom native type: ${type}`)
  }
}

/**
Helper to convert specialized native types.
*/
function convertTypes(items) {
  if (Array.isArray(items)) {
    return items.map(convertTypes);
  }

  if (items && typeof items === 'object') {
    if (items['__native_type']) {
      return createNativeType(items['__native_type'], items);
    }

    let result = {};
    for (var key in items) {
      result[key] = convertTypes(items[key]);
    }
    return result;
  }

  return items;
}

/*
Our custom implementation of the react-native-socket.io interface. The API
closely follows the original but uses our SocketIO native manager classes.
*/
export default class extends EventEmitter {
  constructor() {
    super()
    // XXX: In the future we could allow multiple socket.io connections
    // by returning the event listener name in "connect".
    DeviceEventEmitter.addListener('socketEvent', (event) => {
      this.handleEvent(event);
    });

    this.rooms = new Set();
    this._needsRoomReconnect = false;

    /**
     * To reduce complexity we do not persist room settings on the server side
     * so we must reconnect manually here.
     */
    this.on('reconnect', () => {
      console.log('Disconnect detected will need to rejoin rooms.');
      this._needsRoomReconnect = true;
    });

    this.on('connect', () => {
      if (!this._needsRoomReconnect) {
        return;
      }

      console.log('Reconnected to server rejoining rooms');
      for (let room of this.rooms) {
        console.log('rejoining', room);
        this.emit('join', room);
      }
      this._needsRoomReconnect = false;
    });
  }

  handleEvent(event) {
    let items = event.items || []
    super.emit(event.name, ...convertTypes(items));
  }

  /**
  API compatibility layer...
  */
  on(event, listener) {
    SocketIONative.addListener(event);
    this.addListener(event, listener);
  }

  off(event) {
    SocketIONative.removeListener(event);
    this.removeAllListeners(event);
  }

  /**
  Overrides superclass emit interface for one that emits on the server.

  Note: it is safe to call this when disconnected the native side will buffer
  events and send them on reconnect.
  */
  emit(event, ...data) {
    SocketIONative.emit(event, data);
  }

  disconnect() {
    SocketIONative.disconnect();
  }

  /**
  Connect to the socket.io server note that for now you can only maintain
  _one_ connection to _one_ socket.io server. Multiple calls to connect will
  result in disconnection from the existing server and connecting to the new one.
  */
  connect(host, config) {
    SocketIONative.connect(host, config);
  }

  /**
   * Silk-server specific join room.
   *
   * Automatically will rejoin this room on server reconnection.
   */
  join(room) {
    this.rooms.add(room);
    this.emit('join', room);
  }

  /**
   * Silk-server specific leave room.
   */
  leave(room) {
    this.rooms.delete(room)
    this.emit('leave', room);
  }
}
