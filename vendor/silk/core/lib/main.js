/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

//
// Version check the base device image before doing anything else
//

let baseversion = {
  actual: 'unknown',
  expected: require('./base_version')
};
try {
  baseversion.actual = require('base_version');
} catch(e) {
  console.error(`Unable to load base_version: ${e}`);
}
if (baseversion.actual !== baseversion.expected) { // TODO: use semver
  console.error('\n' +
                '**********************************\n' +
                ' Device base version mismatch\n' +
                `   Expected base version: ${baseversion.expected}\n` +
                `   Actual base version:   ${baseversion.actual}\n` +
                '**********************************');
  throw new Error('Fatal error');
}

let api = require('silk-api');
let btle = require('./btle');
let crashreport = require('./crashreport');
let lights = require('./lights')();
let ui = require('./ui');
let log = require('./log')('main');
let vib = require('./vibrator')();
let wifi = require('./wifi');
let util = require('./util');
let update = require('./update');
let sensors = require('./sensors');

const id = api.id.create();
const name = (util.getprop('persist.silk.displayName')
              || 'Silkcam');

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
  return Promise.all([wifi.init(), btle.init(), sensors.init()]);
})
.then(() => {
  log.info('Activating ambient light sensor');

  sensors.on('data', sensorEvent => {
    if (sensorEvent.sensorType !== sensors.SENSOR_TYPE.LIGHT) {
      return;
    }

    if (sensorEvent.values[0] === 0) {
      // TODO: Turn on flash light when light sensors detects no light
      log.info('Turning on night mode');
    }
  });

  return sensors.activate(sensors.SENSOR_TYPE.LIGHT, 1000);
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

  socket.on('connect_error', e => log.warn(`socket connect_error: ${e}`));
  socket.on('connect_timeout', e => log.warn(`socket connect_timeout: ${e}`));
  socket.on('error', e => log.warn(`socket error:${e}`));
  socket.on('reconnect_attempt', e => log.warn(`socket reconnect_attempt: ${e}`));
  socket.on('reconnect_error', e => log.warn(`socket reconnect_error: ${e}`));
  socket.on('reconnect_failed', e => log.warn(`socket reconnect_failed: ${e}`));
  socket.on('reconnecting', e => log.warn(`socket reconnecting: ${e}`));
})
.catch(e => {
  util.processthrow(`Fatal initialization error: ${e}`);
});

