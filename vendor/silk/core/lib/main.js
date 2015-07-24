/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let api = require('silk-api');
let btle = require('./btle');
let crashreport = require('./crashreport');
let lights = require('./lights')();
let ui = require('./ui');
let log = require('./log')('main');
let vib = require('./vibrator')();
let wifi = require('./wifi');
let ntp = require('./ntp');
let util = require('./util');
let update = require('./update');
let config = require('./config');

const id = api.id.create();
const name = (util.getprop('persist.silk.displayName') || 'Silkcam');

// Initialization Promise...
new Promise(resolve => {
  log.info('Wait for boot complete');
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
  return config.configure(id);
})
.catch(e => {
  util.processthrow(`Fatal initialization error: ${e}`);
});


// State observers
config.on('unconfigured', () => {
  ui('setup');
  offline();
});
config.on('configured', () => {
  ui('connecting');
  wifi.online()
  .then(online)
  .catch(e => util.processthrow(e));
});
ntp.on('time', emitDeviceInfo);
update.on('apply', () => {
  // An OTA update is being applied
  ui('powerdown');
  offline();
});


let socket;

function emitDeviceInfo() {
  if (socket && socket.connected) {
    socket.emit('info', { id: id.toString(), name: name, now: Date.now()} );
  }
}

function online() {
  update.start();

  log.info(`Device ${id} connecting to server ${api.config.server_url} ...`);
  socket = require('socket.io-client')(api.config.server_url);

  let camera = require('./camera')(id.toString());
  socket.on('connect', () => {
    ui('online');
    crashreport.start(socket);
    emitDeviceInfo();
    camera.start(socket);
  });
  socket.on('disconnect', e => {
    log.error(`socket disconnect: ${e}`);
    ui('connecting');
    camera.stop();
    crashreport.stop();

    // When the server disconnects, the socket.io retry logic doesn't kick in so
    // manually attempt a server reconnect
    if (e === 'io server disconnect') {
      socket.connect();
    }
  });
  socket.on('cmd', cmd => {
    let msg = cmd.msg;
    vib.on(500);
    switch (msg) {
    case 'start':
      log.warn('"start" command');
      break;
    case 'stop':
      log.warn('"stop" command');
      break;
    case 'light':
      if (lights) {
        lights.setState(cmd.state);
      }
      break;
    default:
      log.error('Unhandled command', cmd);
      break;
    }
  });

  socket.on('connect_error', e => log.warn(`socket connect_error: ${e}`));
  socket.on('connect_timeout', e => log.warn(`socket connect_timeout: ${e}`));
  socket.on('error', e => log.warn(`socket error:${e}`));
  socket.on('reconnect_attempt', e => log.warn(`socket reconnect_attempt: ${e}`));
  socket.on('reconnect_error', e => log.warn(`socket reconnect_error: ${e}`));
  socket.on('reconnect_failed', e => log.warn(`socket reconnect_failed: ${e}`));
  socket.on('reconnecting', e => log.warn(`socket reconnecting: ${e}`));
}

function offline() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  update.stop();
}


// Force the garbage collector to run regularly to keep heap usage under a tight
// leash
//
// Note that the values used within this function have been selected based on
// intuition and *some* observation, and as such will likely need to be tuned in
// the future.
function runGC() {
  let gcStart = Date.now();
  // Ask the gc to try to run for no more than 250ms
  let gcDone = require('silk-gc1').idleNotification(250);
  let gcStop = Date.now();

  log.info(`GC ran for ${gcStop - gcStart}ms | done=${gcDone}`);

  // Look for new garbage in 20s if v8 says it's done, otherwise continue
  // collection after 5 seconds.
  setTimeout(runGC, gcDone ? 20 * 1000 : 5 * 1000);
}
runGC();
