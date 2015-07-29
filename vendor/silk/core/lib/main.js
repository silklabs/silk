/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let api = require('silk-api');
let btle = require('./btle');
let crashreport = require('./crashreport');
let ui = require('./ui');
let log = require('./log')('main');
let vib = require('./vibrator')();
let wifi = require('./wifi');
let ntp = require('./ntp');
let util = require('./util');
let update = require('./update');
let config = require('./config');
let sensors = require('./sensors');

const id = api.id.create();
const name = (util.getprop('persist.silk.displayName') || 'Silkcam');

//
// Initialization...
//
let bootCompleted = false;
new Promise(resolve => {
  log.info('Wait for boot complete');
  ui.goto('bootanimation');
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
  log.info('Load configuration');
  return config.init();
})
.then(() => {
  log.info('Activating ambient light sensor');
  return sensors.activate(sensors.SENSOR_TYPE.LIGHT, 1000);
})
.then(() => {
  bootCompleted = true;
})
.catch(e => {
  util.processthrow(`Fatal initialization error: ${e}`);
});


//
// State observers
//

let socket = { __iamastub: true, connected: false, disconnect: () => {} };
let camera;
let diag;
let hue;

function emitDeviceInfo() {
  if (socket.connected) {
    socket.emit('info', { id: id.toString(), name: name, now: Date.now()} );
  }
}
ntp.on('time', emitDeviceInfo);

function maybeCreateSocket() {
  if (!socket.__iamastub) {
    return;
  }

  socket = require('socket.io-client')(api.config.server_url,
                                       {autoConnect: false});
  camera = require('./camera')(id.toString());
  camera.on('error', () => {
    log.warn('Camera command errored out');
  });
  diag = require('./diag')(id.toString());

  socket.on('connect', () => {
    ui.goto('online');
    diag.start(socket);
    camera.start(socket);
    crashreport.start(socket);
    update.start();
    if (!hue) {
      hue = require('./hue')();
    }
    emitDeviceInfo();
  });
  socket.on('disconnect', e => {
    log.warn(`socket disconnect: ${e}`);
    update.stop();
    crashreport.stop();
    camera.stop();
    diag.stop();

    switch (e) {
    case 'io client disconnect':
      // Device initiated disconnect
      break;

    case 'io server disconnect':
      // When the server disconnects, the socket.io retry logic doesn't kick in
      // so manually attempt a server reconnect
      socket.connect();
      // falls through

    default:
      ui.goto('connecting');
      break;
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
      if (hue) {
        hue.setState(cmd.state);
      }
      break;
    case 'diag':
      diag.setConfig(cmd.config);
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


// Config service...
config.on('unconfigured', () => {
  if (ui.goto('setup')) {
    socket.disconnect();
    config.configure(id)
    .catch(e => util.processthrow(e));
  }
});
config.on('configured', () => {
  if (ui.goto('connecting')) {

    maybeCreateSocket();

    wifi.online()
    .then(() => {
      log.info(`Device ${id} connecting to server ${api.config.server_url} ...`);
      socket.connect();
    })
    .catch(e => util.processthrow(e));
  }
});

// Update service...
update.on('apply', () => {
  // An OTA update is being applied
  if (ui.goto('powerdown')) {
    socket.disconnect();
  }
});


// UI...
ui.on('key:setup', () => {
  if (bootCompleted) {
    config.unconfigure()
    .catch(e => util.processthrow(e));
  }
});
ui.on('key:powerdown', () => {
  if (ui.goto('powerdown')) {
    socket.disconnect();
    util.setprop('sys.powerctl', 'shutdown');
  }
});
ui.on('key:factoryreset', () => {
  if (ui.goto('powerdown')) {
    log.warn('!! Factory reset !!');
    util.exec('librecovery_test', ['factoryReset'])
    .catch(err => {
      log.warn(`Factory reset failed: ${err}`);
      // Ouch, now what? Reboot I guess.
      util.setprop('sys.powerctl', 'reboot');
    });
  }
});

// Sensors
let nightModeOn = false;
sensors.on('data', sensorEvent => {
  if (sensorEvent.sensorType !== sensors.SENSOR_TYPE.LIGHT) {
    return;
  }

  // Turn on flash when the sensors detect low light
  if ((sensorEvent.values[0] <= 10) && (!nightModeOn)) {
    log.info('Turning on night mode');
    nightModeOn = true;
    if (camera) {
      camera.flash(camera.FLASH_MODE.TORCH);
    }
  } else if ((sensorEvent.values[0] > 10) && (nightModeOn)) {
    log.info('Turning off night mode');
    nightModeOn = false;
    if (camera) {
      camera.flash(camera.FLASH_MODE.OFF);
    }
  }
});


// Force the garbage collector to run regularly to keep the heap on a tight
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
