let {
  NativeModules,
  //EventEmitter,
} = require('react-native');

// TODO: `EventEmitter` is not exposed by the `react-native` npm
// module, so we're cheating here by grabbing it directly from the Haste
// module. We should consider exporting it upstream or vendor-importing
// EventEmitter.js.
import EventEmitter from 'EventEmitter';

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
      // SocketIO pads the first byte of all binary data to indicate what type
      // of data it is... This is only useful internally to socket.io so we
      // strip the byte.
      payload.offset = 1;
      return new NativeBlob(payload);
    default:
      throw new Error(`Unknown custom native type: ${type}`);
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
    // Don't use dot notation to prevent name mangling.
    /* eslint dot-notation:0 */
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

function wrapEvent(method) {
  return (...items) => {
    method(...convertTypes(items));
  };
}

/*
Our custom implementation of the react-native-socket.io interface. The API
closely follows the original but uses our SocketIO native manager classes.
*/
export default class extends EventEmitter {
  constructor(socket) {
    super();

    this.socket = socket;
    this.rooms = new Set();

    this._needsRoomReconnect = false;

    /**
     * To reduce complexity we do not persist room settings on the server side
     * so we must reconnect manually here.
     */
    this.socket.on('reconnect', () => {
      console.log('Disconnect detected will need to rejoin rooms.');
      this._needsRoomReconnect = true;
    });

    this.socket.on('connect', () => {
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

  on(event, listener) {
    // Wrap the object and keep a reference for 'off'.
    let fn = wrapEvent(listener);
    this.socket.on(event, fn);
  }

  off(event) {
    this.socket.off(event);
  }

  /**
  Overrides superclass emit interface for one that emits on the server.

  Note: it is safe to call this when disconnected the native side will buffer
  events and send them on reconnect.
  */
  emit(event, ...data) {
    this.socket.emit(event, ...data);
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
    this.rooms.delete(room);
    this.emit('leave', room);
  }
}
