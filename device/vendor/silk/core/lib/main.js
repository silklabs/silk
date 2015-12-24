/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import ui from './ui';
ui.goto('bootanimation');

import createLog from './log';
const log = createLog('main');

import version from 'silk-core-version';
log.info(`silk-core ${version.branch} ${version.semver} (${version.sha})`);

// Activate source map support to exception stack traces as early as practical
// in the boot sequence
require('source-map-support').install();
{
  // Force the source maps into memory right away. It typically takes ~5
  // seconds to load the source maps and unfortunately asynchronous loading is
  // not currently supported by the source map library.  Taking the hit now
  // avoids an unpredictable delay the first time an exception is thrown.
  log.verbose('Warming up source maps');
  (new Error()).stack; // Trigger a call to Error.prepareStackTrace
  log.verbose('Source maps ready');
}

import assert from 'assert';
import api from './api';
import battery from './battery';

import wifi from './wifi';
import ntp from './ntp';
import * as util from './sysutils';
import update from './update';
import config from './config';
import sensors from './sensors';
import infrared from './infrared';
import server from './server';
import fs from 'mz/fs';
import Say from './say';

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
import makeExtensions from './ext';

// Start the profile server ASAP.
initProfiler();

// Amount of time to wait for async shutdown before forcing power status change.
const SHUTDOWN_TIMEOUT_MS = 45 * 1000;

let id = null;
let btle = null;
let timeline;
let camera;
let logo = null;
let shutdownPromise = null;
let crashreporter;
let outbox;
let networkStatus;
let logcat;
let ext;
let diag;
let say;

// true once the device has a configuration and is ready for normal operation
let configured = false;

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
      // accessible (eg. a local setup without full Internet access)
      if (!configured) {
        // No configuration so abort early
        log.verbose(`Offline as device is not configured`);
        return Promise.resolve(false);
      }
      if (shutdownPromise) {
        log.verbose(`Offline as device is shutting down`);
        return Promise.resolve(false);
      }
      const serverUrl = api.config.serverUrl;
      return new Promise((accept, reject) => {
        isReachable(serverUrl, (err, reachable) => {
          if (err) {
            reject(err);
            return;
          }
          log.verbose(`${serverUrl} reachable? ${reachable}`);
          accept(reachable);
        });
      });
    }
  );
  networkStatus.hintSocket = server;

  outbox = initOutbox(networkStatus);
  crashreporter = makeCrashReporter(outbox);
  jsErrors(crashreporter);

  const bootAbortedFlag = Symbol();
  const maybeAbortBoot = () => {
    if (shutdownPromise) {
      throw bootAbortedFlag;
    }
  };

  return getDeviceId()
    .then(deviceId => {
      id = deviceId;
      crashreporter.assignDeviceId(deviceId);
      logcat = new Logcat(deviceId.toString(), outbox);
      logcat.start();

      // Wait for the battery to initialize and block until there's enough
      // capacity to fully boot.
      return battery.init();
    })
    .then(maybeAbortBoot)
    .then(() => {
      log.info('Initialize hardware');
      say = new Say();

      return Promise.all([
        wifi.init(),
        getBTLE().then(btleInstance => {
          btle = btleInstance;
        }),
        sensors.init(),
        infrared.init(),
        say.init(),
      ]);
    })
    .then(maybeAbortBoot)
    .then(() => {
      log.info('Initialize framework');

      // It's preferable to kill this process over system daemons
      // (usually running as -17) in out of memory situations.
      fs.writeFile('/proc/self/oom_adj', 0);

      // If no time zone is set select Pacific time.  The device currently
      // doesn't really care what time zone it's in, all operations are done
      // in UTC.  However using Pacific for local time helps ensure that log
      // message timestamps are aligned with where most developers are.
      if (util.getprop('persist.sys.timezone', '').length === 0) {
        util.setprop('persist.sys.timezone', 'America/Los_Angeles');
      }

      assert(outbox, 'must have outbox when initializing timeline');
      timeline = new Timeline(id.toString(), outbox);
      camera = require('./camera')(timeline);
      return camera.init();
    })
    .then(maybeAbortBoot)
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
      return config.init();
    })
    .then(maybeAbortBoot)
    .then(() => {
      log.info('main completed device has been booted.');
    }).
    catch(err => {
      if (err === bootAbortedFlag) {
        log.warn('Bootup sequence aborted due to shutdown');
        // Shutdown is in progress, not an error.
        return;
      }
      log.fatal(`Initialization error: ${err}`);
      util.processthrow(err);
      //
      // TODO: We may want to eventually reboot-and-pray in this situation as the
      //       device is now essentially nonoperational.
      //
    });
}
main();

/**
 * Read vendor specific logo
 */
async function readLogo() {
  if (logo) {
    return;
  }
  for (const root of ['/data', '/system']) {
    const logoFile = root + '/silk/media/logo.png';
    try {
      logo = await fs.readFile(logoFile);
      return; // Return once the first logo is successfully read
    } catch (err) {
      log.verbose(`No logo at ${logoFile}: ${err}`);
    }
  }
  logo = [];
}

function emitDeviceInfo() {
  return readLogo()
  .then(() => {
    if (server.connected) {
      server.socket.emit('info', {
        id: id.toString(),
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
      // When moving the device to a new update channel, it's likely that the
      // serverUrl received from the app during initial configuration time will
      // no longer be valid for the new update channel.  Clearing the serverUrl
      // here reverts the device back to using the default server supplied by the
      // current update channel.
      config.forceDefaultServerUrl();
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
  configured = false;
  if (ui.goto('setup')) {
    camera.stopRecording();
    server.disconnect();
    say.speak('Hello there, welcome to your new silk device');
  }
});
config.on('configured', async () => {
  if (!ui.goto('connecting')) {
    return;
  }
  configured = true;
  camera.startRecording();

  // Load extensions in the "background" while initializing wifi
  let extPromise;
  if (!ext) {
    extPromise = makeExtensions({
      btle: btle,
      camera: camera,
      sensors: sensors,
      infrared: infrared,
      timeline: timeline,
      say: say,
    });
  } else {
    extPromise = Promise.resolve(ext);
  }

  await wifi.online();
  ext = await extPromise;

  log.info(`Device ${id} connecting to server ${api.config.serverUrl} ...`);
  server.connect();

  // Yield a pinch of time since updates don't need to start immediately,
  // |update.start()| is currently a little main thread heavy, and there's lots
  // of other activity as the server connection is being established.
  await util.timeout(200);
  update.start();
});

function shutdown(finalPromiseFactory) {
  if (shutdownPromise) {
    log.warn('Shutdown already in progress');
    return;
  }

  log.info('Shutdown started');
  if (!ui.goto('powerdown')) {
    log.error(`ui state was set to 'powerdown' more than once?`);
  }

  const STATUS_COMPLETE = 'complete';
  const STATUS_EXCEPTION = 'exception';
  const STATUS_TIMEOUT = 'timeout';

  if (camera) {
    log.info('Camera stop');
    camera.stopRecording();
  }

  // Outbox shutdown can take a while and runs async so begin right away
  let outboxShutdownPromise = outbox.shutdown();

  // Do all async shutdown work here.
  let asyncWorkPromise = Promise.resolve()
  .then(() => {
    return wifi.shutdown();
  })
  .then(() => {
    if (btle) {
      log.info('BTLE shutdown');
      return btle.changeMode(btle.MODE_OFF);
    }
  })
  .then(() => {
    log.info('Server disconnect');
    server.disconnect();
    log.info('Crash reporter shutdown');
    return crashreporter.shutdown();
  })
  .then(() => {
    log.info('Updates stop');
    return update.stop();
  })
  .then(() => {
    log.info('Waiting for outbox shutdown');
    return outboxShutdownPromise;
  })
  .then(() => {
    // Always make sure this one is last.
    return STATUS_COMPLETE;
  });

  let timeoutPromise = util.timeout(SHUTDOWN_TIMEOUT_MS)
  .then(() => STATUS_TIMEOUT);

  shutdownPromise = Promise.race([ timeoutPromise, asyncWorkPromise ])
  .catch(err => {
    log.error('Shutdown error:', err.stack || err);
    return STATUS_EXCEPTION;
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
}

// Update service...
update.on('staged', () => {
  // An OTA update is ready to be applied.
  shutdown(update.apply.bind(update));
});

// UI...
ui.on('key:setup', () => {
  log.info('Continue holding for factory reset...');
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
  //log.warn('tick');
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
