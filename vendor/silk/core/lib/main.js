/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let api = require('./api');
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
const name = util.getprop('persist.silk.displayName', 'Silkcam');

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


// Initialize example night vision behaviour:
//
// 1. When the light sensor drops below a fixed value, turn on the torch. Turn
//    off the torch when the light level increases.
// 2. If a face is detected while the torch is enabled, turn on the Hue lights.
//    Turn off the Hue lights if a face is then not observed for an amount of
//    time.
//
// TODO: This needs to move out of main.js very soon
function nightVisionExampleBehaviour() {
  const NIGHT_LIGHT_SI_LUX = 3; // light sensor value in SI lux units
  const DAY_LIGHT_SI_LUX = 5;   // light sensor value in SI lux units
  const LIGHT_SENSOR_POLL_INTERVAL_MS = 10 * 1000;
  const HUE_LIGHTS_OFF_TIMEOUT_MS = 15 * 1000;

  let nightModeOn = false;

  sensors.on('data', sensorEvent => {
    if (sensorEvent.sensorType !== sensors.SENSOR_TYPE.LIGHT) {
      return;
    }
    log.debug(`Light sensor level: ${sensorEvent.values[0]}`);

    // Turn on flash when the sensors detect low light
    if (sensorEvent.values[0] <= NIGHT_LIGHT_SI_LUX) {
      if (!nightModeOn) {
        log.info("It's dark out. Turning on night mode");
        nightModeOn = true;
        camera.flash(camera.FLASH_MODE.TORCH);
      }
    } else if (sensorEvent.values[0] >= DAY_LIGHT_SI_LUX) {
      if (nightModeOn) {
        log.info("It's light out. Turning off night mode");
        nightModeOn = false;
        camera.flash(camera.FLASH_MODE.OFF);
      }
    }
  });

  camera.on('start', () => sensors.activate(sensors.SENSOR_TYPE.LIGHT,
                                            LIGHT_SENSOR_POLL_INTERVAL_MS));
  camera.on('stop', () => sensors.deactivate(sensors.SENSOR_TYPE.LIGHT));

  let hueLightsOn = false;
  let faceLostTimeout;
  camera.on('face', faces => {
    if (faceLostTimeout) {
      clearTimeout(faceLostTimeout);
    }
    if (!nightModeOn) {
      return;
    }
    if (faces.length >= 1) {
      if (!hueLightsOn) {
        log.info('Lights on. Face detected.');
        hueLightsOn = true;
        hue.setState({on: true, intensity: 1.0});
      }
    } else {
      faceLostTimeout = setTimeout(() => {
        log.info(`Lights out. No face observed for ${HUE_LIGHTS_OFF_TIMEOUT_MS / 1000} seconds`);
        hue.setState({on: false});
        hueLightsOn = false;
        faceLostTimeout = null;
      }, HUE_LIGHTS_OFF_TIMEOUT_MS);
    }
  });
}

function maybeCreateSocket() {
  if (!socket.__iamastub) {
    return;
  }

  camera = require('./camera')(id.toString());
  camera.on('error', () => {
    log.warn('Camera command errored out');
  });

  nightVisionExampleBehaviour();
  require('./ext')();

  diag = require('./diag')(id.toString());

  socket = require('socket.io-client')(api.config.serverUrl,
      {autoConnect: false});
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

    // On disconnect flush any unsent buffers.
    //
    // Unfortunately there seems to be no "public" socket.io API for this...
    socket.sendBuffer = [];

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
      log.info(`Device ${id} connecting to server ${api.config.serverUrl} ...`);
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

// Force the garbage collector to run regularly to keep the heap on a tight
// leash
//
// Note that the values used within this function have been selected based on
// intuition and *some* observation, and as such will likely need to be tuned in
// the future.
const GC_MAX_RUN_TIME = 200;
const gc1 = require('silk-gc1');
function runGC() {
  // Try to run the gc for less than this number of milliseconds

  let gcStart = Date.now();
  let gcDone;
  let gcStop = gcStart;
  let gcIterations = 0;
  do {
    gcDone = gc1.idleNotification(GC_MAX_RUN_TIME);
    gcIterations++;
    gcStop = Date.now();
  } while (!gcDone && (gcStop - gcStart < GC_MAX_RUN_TIME));

  log.info(`GC ran for ${gcStop - gcStart}ms | ` +
           `iterations=${gcIterations} done=${gcDone}`);

  // Look for new garbage in 20s if v8 says it's done, otherwise continue
  // collection after 5 seconds.
  setTimeout(runGC, gcDone ? 20 * 1000 : 5 * 1000);
}
runGC();
