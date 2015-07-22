let {
  DeviceEventEmitter,
  NativeModules
} = require('react-native')

// React-Native event emitter...
import EventEmitter from 'EventEmitter';

let SocketIONative = NativeModules.SocketIO;

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
  }

  handleEvent(event) {
    let items = event.items || []
    super.emit(event.name, items);
  }

  /**
  API compatibility layer...
  */
  on(event, listener) {
    this.addListener(event, listener);
  }

  off(event) {
    this.removeAllListeners(event);
  }

  /**
  Overrides superclass emit interface for one that emits on the server.
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
}
