/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let util = require('./util');

function assertSameBuffer(test, b1, b2) {
  test.equals(b1.length, b2.length);
  for (let i = 0; i < b1.length; ++i) {
    test.equals(b1[i], b2[i]);
  }
}

function connectStream(test, socket, device, name) {
  return new Promise((resolve, reject) => { //eslint-disable-line no-unused-vars
    socket.onNewVideoStream = (msg) => {
      test.equals(msg.id, device);
      test.equals(msg.name, name);
      socket.onNewVideoStream = null;
      return resolve();
    };
    socket.emit('info', { id: device, now: Date.now(), name: name });
    socket.emit('video', { id: device });
  });
}

function receiveBufferFrom(test, socket, device, name) {
  let frame = new Buffer([0, 1, 2, 3, 4]);

  return new Promise((resolve, reject) => { //eslint-disable-line no-unused-vars
    socket.on('video-' + device, msg => {
      test.equals(msg.id, device);
      test.equals(msg.name, name);
      assertSameBuffer(test, msg.frame, frame);
      return resolve(socket);
    });
    socket.emit('join', 'video-' + device);
    socket.emit('video', { id: device, name: name, frame: frame });
  });
}

function run(test) {
  let socket = null;
  return new Promise((resolve, reject) => { //eslint-disable-line no-unused-vars
    socket = require('socket.io-client')(util.serverUrl);
    socket.on('connect', () => {
      socket.on('video-stream-new', msg => {
        socket.onNewVideoStream(msg);
      });
      socket.emit('join', 'video-streams');
    });
    return resolve();
  }).then(() => {
    return connectStream(test, socket, 'test1', 'Test Name');
  }).then(() => {
    return receiveBufferFrom(test, socket, 'test1', 'Test Name');
  }).then(() => {
    return connectStream(test, socket, 'test2', 'Test 2 Name');
  }).then(() => {
    return receiveBufferFrom(test, socket, 'test2', 'Test 2 Name');
  }).then(() => {
    return receiveBufferFrom(test, socket, 'test1', 'Test Name');
  }).then(() => {
    return new Promise((resolve, reject) => { //eslint-disable-line no-unused-vars
      let rooms = new Set(['test1', 'test2']);
      let sock = require('socket.io-client')(util.serverUrl,
                                             { multiplex: false });
      sock.on('video-stream-new', msg => {
        test.ok(rooms.has(msg.id), 'Notified of known room');
        rooms.delete(msg.id);
        if (0 === rooms.size) {
          sock.close();
          resolve(socket);
        }
      });
      sock.emit('join', 'video-streams');
    });
  });
}

exports.test = function(test) {
  test.expect(38);
  util.setup(test).then(() => run(test)).then((socket) => {
    socket.close();
    util.finish(test);
  });
};
