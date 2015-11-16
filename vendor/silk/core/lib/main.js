/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import ui from './ui';
ui.goto('bootanimation');

// Activate source map support to exception stack traces as early as practical
// in the boot sequence
let v8PrepareStackTrace = Error.prepareStackTrace;
require('source-map-support').install();

import assert from 'assert';
import api from './api';
import battery from './battery';
import createLog from './log';

import wifi from './wifi';
import ntp from './ntp';
import * as util from './sysutils';
import update from './update';
import config from './config';
import sensors from './sensors';
import infrared from './infrared';
import server from './server';
import fs from 'mz/fs';
import deferred from './deferred';

import getBTLE from './btle';
import getDeviceId from './deviceid';
import makeCrashReporter from './crash_reporter';
import jsErrors from './js_errors';
import initOutbox from './outbox';
import initProfiler from './profiler/server';
import NetworkStatus from './network_status';
import isReachable from 'is-reachable';
import Logcat from './logcat';
import Timeline from './timeline';

const log = createLog('main');
// Start the profile server ASAP.
initProfiler();

// Wait for 60 seconds for boot before issuing a warning.
const BOOT_TIMEOUT = 60 * 1000;
// How frequently (in ms) we check if the boot prop has been set.
const BOOT_CHECK_INTERVAL = 1000;
// Amount of time to wait for async shutdown before forcing power status change.
const SHUTDOWN_TIMEOUT_MS = 30 * 1000;

const name = util.getprop('persist.silk.displayName', 'Silkcam');
const logoFilePath = '/system/silk/media/logo.png';

let id = null;
let btle = null;
let timeline;
let camera;
let logo = null;
let bootCompleted = false;
let shutdownPromise = null;
let crashreporter;
let outbox;
let networkStatus;
let logcat;
let ext;
let diag;
let hue;

/**
 * Wait until system has been booted.
 */
function _waitForSysBoot(startTime, defer) {
  // Don't use an arbitrarily long promise chain if one is passed use it.
  startTime = startTime || Date.now();
  defer = defer || deferred();

  // If we have waited a long time to boot log an error but keep trying.
  if (Date.now() - startTime > BOOT_TIMEOUT) {
    log.error(`Boot took over ${BOOT_TIMEOUT} ms something might be broken`);
  }

  if ('1' === util.getprop('sys.boot_completed')) {
    defer.accept();
  } else {
    log.info('Waiting for sys.boot_completed=1');
    setTimeout(_waitForSysBoot.bind(this, startTime, defer), BOOT_CHECK_INTERVAL);
  }

  return defer.promise;
}


function boot() {
  return _waitForSysBoot().
    then(() => {
      // Wait for the battery to initialize and block until there's enough
      // capacity to fully boot.
      return battery.init();
    })
    .then(() => {
      log.info('Initialize hardware');
      return Promise.all([
        wifi.init(),
        getBTLE().then(btleInstance => {
          btle = btleInstance;
        }),
        sensors.init(),
        infrared.init(),
      ]);
    })
    .then(() => {
      log.info('Initialize framework');

      // It's preferable to kill this process over system daemons
      // (usually running as -17) in out of memory situations.
      fs.writeFile('/proc/self/oom_adj', 0);

      assert(outbox, 'must have outbox when initializing timeline');
      timeline = new Timeline(id.toString(), outbox);
      camera = require('./camera')(timeline);
      return camera.init();
    })
    .then(() => {
      util.setprop('silk.boot_completed',
                   1 + parseInt(util.getprop('silk.boot_completed', 0)));

      diag = require('./diag')(id.toString());

      btle.on('region-entered', (uuid, rssi) => {
        log.info('Device \'%s\' entered range %d', uuid, rssi);
      });
      btle.on('region-range', (uuid, rssi) => {
        log.info('Device \'%s\' range %d', uuid, rssi);
      });
      btle.on('region-exited', uuid => {
        log.info('Device \'%s\' exited range', uuid);
      });

      log.info('Load configuration');
      return config.init(networkStatus);
    });
}

/**
 * Wait for bootup and initialize the device.
 */
function main() {
  // Start these ASAP so that unhandled exceptions in the boot sequence will
  // be properly recorded.
  networkStatus = new NetworkStatus(wifi,
    () => {
      // Instead of using the default "Internet available test", tell
      // NetworkStatus to only report online if the configured server is
      // assessable (eg. a local setup without full Internet access)
      return new Promise((accept, reject)=> {
        isReachable(api.config.serverUrl, (err, reachable) => {
          if (err) {
            reject(err);
            return;
          }
          log.verbose(`${api.config.serverUrl} reachable? ${reachable}`);
          accept(reachable);
        });
      });
    }
  );

  networkStatus.hintSocket = server;

  outbox = initOutbox(networkStatus);
  crashreporter = makeCrashReporter(outbox);
  jsErrors(crashreporter);

  return getDeviceId()
    .then(deviceId => {
      id = deviceId;
      api.accessToken = deviceId;
      crashreporter.assignDeviceId(deviceId);
      logcat = new Logcat(deviceId.toString(), outbox);
      logcat.start();

      return boot();
    })
    .then(() => {
      // Set global state up.
      bootCompleted = true;
      log.info('main completed device has been booted.');
    });
}

main().catch(err => {
  log.fatal(`Initialization error: ${err}`);
  util.processthrow(err);
  //
  // TODO: We may want to eventually reboot-and-pray in this situation as the
  //       device is now essentially nonoperational.
  //
});

/**
 * Read vendor specific logo
 */
function readLogo() {
  if (logo) {
    return Promise.resolve();
  }

  return fs.readFile(logoFilePath)
  .then(data => {
    logo = data;
    return Promise.resolve();
  })
  .catch(err => {
    log.warn(`No vendor logo available at ${logoFilePath} err: ${err}`);
    logo = [];
    return Promise.resolve();
  });
}

function emitDeviceInfo() {
  return readLogo()
  .then(() => {
    if (server.connected) {
      server.socket.emit('info', {
        id: id.toString(),
        name: name,
        now: Date.now(),
        logo: logo,
        previewSize: camera.previewSize,
      });
    }
  });
}
ntp.on('time', emitDeviceInfo);

// Server related...
server.on('connect', () => {
  ui.goto('online');
  emitDeviceInfo()
  .then(() => {
    diag.start(server.socket);
    timeline.socket = server.socket;
  })
  .catch(util.processthrow);
});

server.on('disconnect', () => {
  diag.stop();
  timeline.socket = null;
});

server.on('reconnecting', () => ui.goto('connecting'));

server.on('cmd', cmd => {
  // Check if the command is intended for extensions
  if (cmd.msgTarget === 'extensions') {
    if (ext) {
      ext.onCommand(cmd);
    }
    return;
  }

  switch (cmd.msg) {
  case 'light':
    if (hue) { // TODO: This command is no longer used by clients
      hue.setState(cmd.state);
    }
    break;
  case 'diag': // TODO: This command is no longer used by clients
    diag.setConfig(cmd.config);
    break;

  // The 'livestream' command is sent by the server to request live streaming
  // data from this device.  Supported streams: preview, video, logging
  //
  case 'livestream':
    log.info('livestream command:', JSON.stringify(cmd));
    let flag = cmd.diag ? 1 : 0;
    diag.setConfig({dash: flag, logcat: flag});

    timeline.configLiveStream(!!cmd.preview, !!cmd.video);
    break;
  case 'reboot':
    log.info('reboot command:', JSON.stringify(cmd));
    if (cmd.channel) {
      log.info('  reboot: setting update channel to', cmd.channel);
      util.setprop('persist.silk.update.channel', cmd.channel);
    }
    log.info('  rebooting ...');
    util.setprop('sys.powerctl', 'reboot');
    break;
  default:
    log.error('Unknown command:', JSON.stringify(cmd));
    break;
  }
});

// Config service...
config.on('unconfigured', () => {
  if (ui.goto('setup')) {
    camera.stopRecording();
    server.disconnect();
  }
});
config.on('configured', () => {
  if (ui.goto('connecting')) {
    camera.startRecording();
    wifi.online()
    .then(() => {
      update.start();
      log.info(`Device ${id} connecting to server ${api.config.serverUrl} ...`);
      server.connect();
    })
    .then(() => {

      if (!hue) {
        // Initialize hue module, which is special in the following ways:
        //
        // 1. It will fail to initialize if there's no wifi connection.
        //
        // 2. Deep within the hue initialization, the q module throws/catches an error
        //    to check if an Error object contains stack traces (e.stack).  However
        //    throwing this Error() triggers the loading of source maps unnecessarily,
        //    delaying startup and consuming memory. As a workaround for this (and in
        //    lieu of patching the q module), temporary remove the prepareStackTrace
        //    implementation provided by the 'source-map-support' module.
        //
        try {
          let prepareStackTrace = Error.prepareStackTrace;
          Error.prepareStackTrace = v8PrepareStackTrace;
          hue = require('./hue')();
          Error.prepareStackTrace = prepareStackTrace;
        } catch (e) {
          log.warn(`Error: hue module failed to init: ${e}: ${e.stack}`);
        }
      }

      // Load extensions
      // (currently need to wait for hue to initialize, otherwise this could be
      //  done much sooner)
      if (!ext) {
        ext = require('./ext')({ // eslint-disable-line
          btle: btle,
          camera: camera,
          hue: hue,
          sensors: sensors,
          infrared: infrared,
          timeline: timeline,
        });
      }
    })
    .catch(util.processthrow);
  }
});

function shutdown(finalPromiseFactory) {
  if (shutdownPromise) {
    log.warn('Shutdown caller more than once');
    return shutdownPromise;
  }

  const STATUS_COMPLETE = 'complete';
  const STATUS_EXCEPTION = 'exception';
  const STATUS_TIMEOUT = 'timeout';

  log.info('Shutdown started');

  // Do all async shutdown work here.
  let asyncWorkPromise = Promise.resolve(ui.goto('powerdown'))
    .then(uiStateWasSet => {
      if (!uiStateWasSet) {
        log.warn(`ui state was set to 'powerdown' more than once`);
      }
      camera.stopRecording();
      return crashreporter.shutdown();
    })
    .then(() => {
      server.disconnect();
      update.stop();
    })
    .then(outbox.shutdown)
    .then(() => {
      // Always make sure this one is last.
      return STATUS_COMPLETE;
    });

  let timeoutPromise = util.timeout(SHUTDOWN_TIMEOUT_MS)
    .then(() => {
      return STATUS_TIMEOUT;
    });

  shutdownPromise = Promise.race([ timeoutPromise, asyncWorkPromise ])
    .catch(err => {
      log.error('Shutdown error: %s', err);
      return 'exception';
    })
    .then(status => {
      switch (status) {
      case STATUS_COMPLETE:
        log.info('Shutdown completed normally');
        break;
      case STATUS_EXCEPTION:
        break;
      case STATUS_TIMEOUT:
        log.error('Shutdown timed out!');
        break;
      default:
        log.warn('Unknown status: %s', status);
      }

      if (finalPromiseFactory) {
        return finalPromiseFactory();
      }

      log.info('Powering off');
      util.setprop('sys.powerctl', 'shutdown');
    });

  return shutdownPromise;
}

// Update service...
update.on('staged', () => {
  // An OTA update is ready to be applied.
  shutdown(update.apply.bind(update));
});

// UI...
ui.on('key:setup', () => {
  log.info('Unconfigure!', { bootCompleted });
  if (bootCompleted) {
    config.unconfigure()
    .catch(util.processthrow);
  }
});
ui.on('key:powerdown', shutdown);
ui.on('key:factoryreset', () => {
  log.warn('!! Factory reset !!');

  let finalPromiseFactory = () => {
    return util.exec('librecovery_test', ['factoryReset'])
      .catch(err => {
        log.warn(`Factory reset failed: ${err}`);
        // Ouch, now what? Reboot I guess.
        util.setprop('sys.powerctl', 'reboot');
      });
  };

  shutdown(finalPromiseFactory);
});

// Battery monitoring
battery.on('needs-to-charge', () => ui.goto('charging'));
battery.on('out-of-power', shutdown);

//
// Monitor responsiveness of the main thread.
//
// Emit warnings when it looks like some processing is taking to long and thus
// potentially starving others.
//
const WATCHDOG_MS = 250;
const BOGGED_DOWN_MS = WATCHDOG_MS * 2;
let lastDogTick = Date.now();
function watchdog() {
  let diff = Date.now() - lastDogTick;
  //log.debug('tick');
  if (diff > BOGGED_DOWN_MS) {
    log.warn(`====[ Main thread was bogged down for ${diff - WATCHDOG_MS}ms ]====`);
  }
  lastDogTick = Date.now();
  setTimeout(watchdog, WATCHDOG_MS);
}
watchdog();


// Force the garbage collector to run regularly to keep the heap on a tight
// leash
//
// Note that the values used within this function have been selected based on
// intuition and *some* observation, and as such will likely need to be tuned in
// the future.
const GC_MAX_RUN_TIME = 100;
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
