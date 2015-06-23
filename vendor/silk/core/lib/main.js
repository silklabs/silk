/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let api = require('silk-api');
let id = api.id.create();
let lights = require('./lights')();
let vib = require('./vibrator')();

let ui = require('./ui');

process.on('uncaughtException', err => {
  console.log('Error:', err, err.stack);
  vib.pattern(
    300, 200, 300, 200, 300, // S
    400,
    600, 200, 600, 200, 600, // O
    400,
    300, 200, 300, 200, 300  // S
  );
});


ui('bootanimation');

let camera;
require('./config')(id).then(() => {
  ui('connecting');
  let socket = require('socket.io-client')(api.config.server_url);

  console.log(`Device ${id} connecting to server ${api.config.server_url} ...`);
  socket.on('connect', () => {
    ui('online');

    if (!camera) {
      camera = require('./camera')(id.toString());
    }
    camera.start(socket);

    socket.on('cmd', cmd => {
      let msg = cmd.msg;
      vib.on(500);
      switch (msg) {
      case 'start':
        break;
      case 'stop':
        break;
      case 'light':
        lights && lights.setState(cmd.state); //eslint-disable-line no-unused-expressions
        return;
      default:
        console.log('Unhandled command', cmd);
        return;
      }
    });
  });
  socket.on('disconnect', () => {
    ui('connecting');
    if (camera) {
      camera.stop();
    }
  });
  socket.on('error', err => console.log('Connection error:', err));
});
