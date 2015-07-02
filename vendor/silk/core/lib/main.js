/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let api = require('silk-api');
let id = api.id.create();
let btle = require('./btle');
let lights = require('./lights')();
let ui = require('./ui');
let vib = require('./vibrator')();
let wifi = require('./wifi');
let util = require('./util');

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

new Promise(resolve => {
  console.log('Wait for boot complete');
  ui('bootanimation');
  let _waitForBoot = function() {
    if ('1' === util.getprop('sys.boot_completed')) {
      resolve();
    } else {
      console.log('Waiting for sys.boot_completed=1');
      util.timeout(1000).then(_waitForBoot);
    }
  };
  _waitForBoot();
})
.then(() => {
  console.log('Initialize hardware');
  return Promise.all([wifi.init(), btle.init()]);
})
.then(() => {
  console.log('Load configuration');
  return require('./config')(id);
})
.then(() => {
  ui('connecting');
  return wifi.online();
})
// Connect to the server and start streaming
.then(() => {
  console.log(`Device ${id} connecting to server ${api.config.server_url} ...`);
  let socket = require('socket.io-client')(api.config.server_url);


  let camera = require('./camera')(id.toString());
  socket.on('connect', () => {
    ui('online');

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
    camera.stop();
  });
  socket.on('error', err => console.log('Connection error:', err));

  socket.on('reconnect_attempt', e => console.log(`reconnect_attempt: ${e}`));
  socket.on('reconnect_error', e => console.log(`reconnect_error: ${e}`));
  socket.on('reconnect_failed', e => console.log(`reconnect_failed: ${e}`));
},
e => {
  console.error(`Fatal initialization error: ${e}`); // TODO: Recover
});

