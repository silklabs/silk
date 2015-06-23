/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var assert = require('assert');
var localStorage = require('localStorage');

// The local device state.
function localState(name) {
  var key = 'device-state-' + name;
  return {
    get: function get() {
      return JSON.parse(localStorage.getItem(key));
    },
    set: function set(data) {
      localStorage.setItem(key, JSON.stringify(data));
    }
  };
};

// This module can be instantiated with only an idStr if the caller
// doesn't have the device key.  But if the caller does provide a full
// key, it must match the idStr.
module.exports = function (idStr, id) {
  assert(!id || idStr == id.toString());

  // Where we store and retrieve local state for this device.
  var ls = localState(idStr);

  // The device state object we will return.
  function DeviceState() {
    this.state = ls.get();
    this.callbacks = {
      update: []
    };
  }

  DeviceState.prototype = {
    on: function on(event, callback) {
      this.callbacks[event].push(callback);
      return this;
    },
    update: function update() {
      // No server connection yet, just update the local copy.
      ls.set(this.state);
    }
  };
  var deviceState = new DeviceState();

  // Establish connection to the server. If we already have a connection
  // socket.io will multiplex for us.

  // TODO: add config to this module
  //  var server_host = require('./config.js').server_host;
  var server_host = 'http://localhost:8888';
  var socket = require('socket.io-client')(server_host);

  // When the socket connects, attach it to the update() method of
  // deviceState and issue a watch request to the server so we get
  // future updates delivered.
  socket.on('connect', function () {
    deviceState.update = function () {
      Object.getPrototypeOf(deviceState).update.call(this, deviceState.state);
      socket.emit('update', { id: idStr, state: deviceState.state });
    };
    socket.emit('watch', { id: idStr });
  });

  // When we disconnected remove the update() function and fall
  // to the prototype update, which only sets the local state.
  socket.on('disconnect', function () {
    delete deviceState.update;
  });

  // Process incoming updates.
  socket.on('update', function (res) {
    if (res.id !== idStr) return;
    // Filter redundant state updates.
    if ('state' in deviceState && JSON.stringify(deviceState.state) === JSON.stringify(res.state)) {
      return;
    }
    deviceState.state = res.state;
    deviceState.callbacks.update.forEach(function (callback) {
      callback();
    });
  });

  return deviceState;
};
