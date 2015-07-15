/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let api = require('silk-api');
let btle = require('./btle');
let crashreport = require('./crashreport');
let lights = require('./lights')();
let log = require('./log')('main');
let ui = require('./ui');
let vib = require('./vibrator')();
let wifi = require('./wifi');
let util = require('./util');
let update = require('./update');

const id = api.id.create();
const name = (util.getprop('persist.silk.displayName')
              || 'Silkcam');

new Promise(resolve => {
  console.log('Wait for boot complete');
  ui('bootanimation');
  let _waitForBoot = function() {
    if ('1' === util.getprop('sys.boot_completed')) {
      resolve();
    } else {
      log.info('Waiting for sys.boot_completed=1');
      util.timeout(1000).then(_waitForBoot);
    }
  };
  _waitForBoot();
})
.then(() => {
  log.info('Initialize hardware');
  return Promise.all([wifi.init(), btle.init()]);
})
.then(() => {
  log.info('Load configuration');
  return require('./config')(id);
})
.then(() => {
  ui('connecting');
  return wifi.online();
})
// Start polling for updates.
.then(update.start)
// Connect to the server and start streaming
.then(() => {
  log.info(`Device ${id} connecting to server ${api.config.server_url} ...`);
  let socket = require('socket.io-client')(api.config.server_url);

  function emitDeviceInfo() {
    socket.emit('info', { id: id.toString(), name: name, now: Date.now()} );
  }
  require('./ntp').on('time', () => {
    if (socket.connected) {
      emitDeviceInfo();
    }
  });

  let camera = require('./camera')(id.toString());
  socket.on('connect', () => {
    ui('online');
    crashreport.start(socket);
    emitDeviceInfo();
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
        log.error('Unhandled command', cmd);
        return;
      }
    });
  });
  socket.on('disconnect', () => {
    ui('connecting');
    camera.stop();
    crashreport.stop();
  });
  socket.on('error', err => log.warn('Connection error:', err));

  socket.on('reconnect_attempt', e => log.info(`reconnect_attempt: ${e}`));
  socket.on('reconnect_error', e => log.info(`reconnect_error: ${e}`));
  socket.on('reconnect_failed', e => log.warn(`reconnect_failed: ${e}`));
})
.catch(e => {
  util.processthrow(`Fatal initialization error: ${e}`);
});

