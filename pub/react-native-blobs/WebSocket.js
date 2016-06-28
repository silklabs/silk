/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 */
'use strict';

const base64 = require('base64-js');
const {NativeModules} = require('react-native');

class WebSocketEvent {
  constructor(type, eventInitDict) {
    this.type = type.toString();
    Object.assign(this, eventInitDict);
  }
}

// Monkey-patch ws.binaryType getter/setter
Object.defineProperty(global.WebSocket.prototype, 'binaryType', {
  configurable: true,
  enumerable: true,
  get: function () {
    return this._binaryType || 'arraybuffer';
  },
  set: function (binaryType) {
    if (binaryType !== 'blob' && binaryType !== 'arraybuffer') {
      throw new Error(`binaryType must be either 'blob' or 'arraybuffer'`);
    }
    this._binaryType = binaryType;
    NativeModules.WebSocketModule.setBinaryType(binaryType, this._socketId);
  },
});

// Monkey-patch receiving blobs
const registerEvents = global.WebSocket.prototype._registerEvents;
global.WebSocket.prototype._registerEvents = function() {
  registerEvents.call(this);

  // Throw away existing 'websocketMessage' subscription.
  const oldMessageSub = this._subscriptions.shift();
  oldMessageSub.remove();

  this._subscriptions.push(
    this._eventEmitter.addListener('websocketMessage', ev => {
      if (ev.id !== this._socketId) {
        return;
      }
      let data = ev.data;
      if (ev.type === 'binary') {
        data = base64.toByteArray(ev.data).buffer;
      } else if (ev.type === 'blob') {
        data = Blob.create(ev.data);
      }
      this.dispatchEvent(new WebSocketEvent('message', { data }));
    }),
  );
};

// Monkey-patch sending blobs
const send = global.WebSocket.prototype.send;
global.WebSocket.prototype.send = function(data) {
  if (this.readyState === this.CONNECTING) {
    throw new Error('INVALID_STATE_ERR');
  }
  if (data instanceof Blob) {
    NativeModules.WebSocketModule.sendBlob(data, this._socketId);
    return;
  }
  send.call(this, data);
};
