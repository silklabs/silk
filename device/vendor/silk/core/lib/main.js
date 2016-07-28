/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

import gc1 from 'silk-gc1';
import {install as installSourceMapSupport} from './sourcemaps.js';
import version from 'silk-core-version';

import ui from 'silk-device-ui';
import * as util from 'silk-sysutils';
import createLog from 'silk-log/device';

const log = createLog('main');

log.info(`silk-core ${version.branch} ${version.semver} (${version.sha})`);
const bootStartMs = util.uptime();
ui.goto('bootanimation');

// Activate source map support to exception stack traces as early as practical
// in the boot sequence
installSourceMapSupport();

if (process.platform !== 'android') {
  let segfaultHandler = require('segfault-handler'); // eslint-disable-line import/no-require
  segfaultHandler.registerHandler('crash.log');
}

import assert from 'assert';
import api from 'silk-device-api';
import {MetricTypes} from 'silk-api';
import Battery from 'silk-battery';

import wifi from 'silk-wifi';
import ntp from 'silk-ntp';
import update from 'silk-update';
import config from './config';
import silkconfig from 'silk-config';
import sensors from 'silk-sensors';
import factoryReset from 'silk-factory-reset';
import infrared from './infrared';
import Server from './server';
import Connections from './connections';
import fs from 'mz/fs';
import say from 'silk-say';

import getBTLE from './btle/parent';
import getDeviceId from './deviceid';
import makeCrashReporter from './crash_reporter';
import Diag from './diag';
import jsErrors from './js_errors';
import initOutbox from './outbox';
import initProfiler from './profiler/server';
import netstatus from 'silk-netstatus';
import isReachable from 'is-reachable';
import Logcat from './logcat';
import Timeline from './timeline';
import Camera from 'silk-camera';
import CameraClipRecorder from './camera_clip_recorder';
import makeExtensions from './ext';
import JSStartup from './metrics/js_startup';
import startCollectingProcessMetrics from './process_metrics';

// Start the profile server ASAP.
initProfiler();

api.metrics.add(new JSStartup({
  startupMS: new MetricTypes.Integer(Math.floor(process.uptime() * 1000)),
}));

// Amount of time to wait for async shutdown before forcing power status change.
const SHUTDOWN_TIMEOUT_MS = 45 * 1000;

// If true, don't attempt to get configured or connect with the Silk server but
// otherwise try to be a functional as possible.
const DEV_NO_SERVER_CONNECT = util.getboolprop('persist.silk.dev.no_server', false);

let battery = new Battery();
let id = null;
let btle = null;
let timeline;
let camera;
let cameraClipRecorder;
let logo = null;
let server = null;
let connections = null;
let shutdownPromise = null;
let crashreporter;
let outbox;
let logcat;
let ext;
let diag;

// true once the device has a configuration and is ready for normal operation
let configured = false;

/**
 * Read vendor specific logo
 * @private
 */
async function readLogo() {
  if (logo) {
    return;
  }
  for (const root of ['data', 'system']) {
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

/**
 * In debug builds register an mDNS service for ADB so that the device can be
 * easily found by on the local network.
 */
async function publishMDnsAdbService() {
  if (!util.getboolprop('ro.debuggable', false)) {
    return;
  }

  log.info('Registering adb mDNS service');
  const hostname = util.getstrprop('net.hostname');
  try {
    await util.exec('ndc', ['mdns', 'mdnssd', 'start-service']);
    await util.exec('ndc', ['mdns', 'mdnssd', 'stop-sethostname', '1']);
    await util.exec('ndc', ['mdns', 'mdnssd', 'sethostname', '1', hostname]);
    await util.exec('ndc', ['mdns', 'mdnssd', 'stop-register', '2']);
    await util.exec('ndc', ['mdns', 'mdnssd', 'register', '2', hostname, '_adb._tcp', '5555']);
  } catch (err) {
    log.warn('Unable to configure mDNS', err);
  }
}

/**
 * This module is an entry point into core process. It waits for bootup and
 * initialize the device.
 * @private
 */
function main() {
  connections = new Connections();
  server = new Server(connections);

  // Start these ASAP so that unhandled exceptions in the boot sequence will
  // be properly recorded.
  netstatus.start(
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

  let netstatusOrStub = netstatus;

  if (DEV_NO_SERVER_CONNECT) {
    netstatusOrStub = {
      check: () => undefined,
      on: () => undefined,
      online: false,
    };
  }
  server.on('connect', netstatusOrStub.check);
  server.on('disconnect', netstatusOrStub.check);
  netstatusOrStub.on('online', () => connections.reconnect());
  outbox = initOutbox(netstatusOrStub);

  crashreporter = makeCrashReporter(outbox);
  jsErrors(crashreporter);

  // Init metrics...
  netstatusOrStub.on('online', api.metrics.onConnectivityChange);
  netstatusOrStub.on('offline', api.metrics.onConnectivityChange);
  if (!DEV_NO_SERVER_CONNECT) {
    api.metrics.start();
  }

  startCollectingProcessMetrics();

  const bootAbortedFlag = Symbol();
  const maybeAbortBoot = () => {
    if (shutdownPromise) {
      throw bootAbortedFlag;
    }
  };

  // It's preferable to kill this process over system daemons
  // (usually running as -17) in out of memory situations.
  if (['linux', 'android'].some(platform => platform === process.platform)) {
    fs.writeFile('/proc/self/oom_adj', 0);
  }

  // If no time zone is set select Pacific time.  The device currently
  // doesn't really care what time zone it's in, all operations are done
  // in UTC.  However using Pacific for local time helps ensure that log
  // message timestamps are aligned with where most developers are.
  if (util.getprop('persist.sys.timezone', '').length === 0) {
    util.setprop('persist.sys.timezone', 'America/Los_Angeles');
  }

  return getDeviceId()
    .then(deviceId => {
      api.accessToken = id = deviceId;
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

      assert(outbox, 'must have outbox when initializing timeline');
      camera = new Camera(silkconfig);
      cameraClipRecorder = new CameraClipRecorder(camera, server);
      camera.attachFrameReplacer(cameraClipRecorder);
      timeline = new Timeline(server, outbox, camera);

      // Camera mute control
      const AUDIO_MUTE_PROP = 'persist.silk.capture.mute';
      let updateCameraMute = () => {
        const audioMute = util.getboolprop(AUDIO_MUTE_PROP, false);
        camera.setMute(audioMute);
      };
      updateCameraMute();
      util.propWatcher.on(AUDIO_MUTE_PROP, updateCameraMute);

      let hw = [
        camera.init(),
        wifi.init(),
        getBTLE().then(btleInstance => {
          btle = btleInstance;
        }),
        infrared.init(),
        readLogo(),
      ];
      if (process.platform === 'android') {
        hw = hw.concat([
          sensors.init(),
          say.init(),
        ]);
      }
      return Promise.all(hw);
    })
    .then(maybeAbortBoot)
    .then(async () => {
      diag = new Diag(server);

      // Activate the accelerometer once for the entire system (issue #876),
      // polling every 250ms as we don't need super-high accuracy.
      sensors.activate(sensors.SENSOR_TYPE.ACCELEROMETER, 250);

      if (btle) {
        btle.on('region-entered', (uuid, rssi) => {
          log.info('Device \'%s\' entered range %d', uuid, rssi);
        });
        btle.on('region-range', (uuid, rssi) => {
          log.info('Device \'%s\' range %d', uuid, rssi);
        });
        btle.on('region-exited', uuid => {
          log.info('Device \'%s\' exited range', uuid);
        });
      }

      // Load extensions now that hardware is initialized
      ext = await makeExtensions({
        btle: btle,
        camera: camera,
        sensors: sensors,
        infrared: infrared,
        timeline: timeline,
        ui: ui,
        say: say,
        server: server,
      });
    })
    .then(maybeAbortBoot)
    .then(() => {
      if (!DEV_NO_SERVER_CONNECT) {
        log.info('Load configuration');
        return config.init(server);
      }
      return null;
    })
    .then(maybeAbortBoot)
    .then(() => {
      if (DEV_NO_SERVER_CONNECT) {
        onConfigured();
      }
      const bootTimeS = util.uptime(bootStartMs) / 1000;
      log.info(`boot complete in ${bootTimeS} seconds`);
      util.setprop('silk.boot_completed',
                   1 + parseInt(util.getprop('silk.boot_completed', 0)));
    }).
    catch(err => {
      if (err === bootAbortedFlag) {
        log.warn('Bootup sequence aborted due to shutdown');
        // Shutdown is in progress, not an error.
        return;
      }
      log.fatal(`Initialization error:`, err);
      util.processthrow(err);
      //
      // TODO: We may want to eventually reboot-and-pray in this situation as the
      //       device is now essentially nonoperational.
      //
    });
}
main();

function emitDeviceInfo() {
  if (server.connected) {
    server.send('info', {
      logo,
      now: Date.now(),
      videoSize: camera.videoSize,
      previewSize: camera.available ? timeline.previewSize : null,
      objectsSize: camera.getFrameSize(),
    });
  }
}
ntp.on('time', emitDeviceInfo);

// Server related...
server.on('connect', () => {
  ui.goto('online');
  emitDeviceInfo();
});

server.on('reconnecting', () => {
  ui.goto('connecting');
});

server.on('cmd', cmd => {
  // TODO: Use Joi to validate the inbound command

  // Check if the command is intended for extensions
  if (cmd.msgTarget === 'extensions') {
    if (ext) {
      ext.onCommand(cmd);
    }
    return;
  }

  switch (cmd.msg) {
  // The 'livestream' command is sent by the server to request live streaming
  // data from this device.
  // Supported streams: preview, video, diag, mic, object.
  //
  // TODO: once the 'livestream' command is strongly typed between
  // server/device, move this processing into the diag/timeline/camera objects
  // themselves.
  case 'livestream':
    {
      log.info('livestream command:', JSON.stringify(cmd));
      let flag = cmd.diag ? 1 : 0;
      diag.setConfig({dash: flag, logcat: flag});
      timeline.configLiveStream({
        preview: !!cmd.preview,
        video: !!cmd.video,
        diag: !!cmd.diag,
        objects: !!cmd.objects,
      });
      cameraClipRecorder.setDiag(!!cmd.diag);

      // FIXME/TODO: we want to notify the audio assistant extension
      // that livestream state has changed, but we don't want to notify
      // *all* extensions ... so explicitly target the audio extension
      // for now (if it happens to be loaded).
      cmd.targetName = 'samsungtv';
      ext.onCommand(cmd);
    }
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
  case 'diagCommand':
    log.info('diagCommand:', JSON.stringify(cmd));
    switch (cmd.subsystem) {
    case 'timeline':
      timeline.diagCommand(cmd.name, cmd.arg);
      break;
    case 'camera':
      cameraClipRecorder.diagCommand(cmd.name, cmd.arg);
      break;
    case 'speak':
      log.info('speak command:', JSON.stringify(cmd));
      say.speak(cmd.name, cmd.arg);
      break;
    default:
      log.warn('Unknown diag subsystem:', cmd.subsystem);
      break;
    }
    break;
  default:
    log.error('Unknown command:', JSON.stringify(cmd));
    break;
  }
});

// Config service...
config.on('unconfigured', () => {
  configured = false;
  if (ui.goto('unconfigured')) {
    camera.stopRecording();
    server.disconnect();
  }
});

config.on('configStarted', () => {
  ui.goto('configStarted');
});

config.on('configRegistering', () => {
  ui.goto('configRegistering');
});

config.on('configured', onConfigured);
async function onConfigured() {
  if (!ui.goto('connecting')) {
    return;
  }
  configured = true;
  camera.startRecording();
  await wifi.online();

  publishMDnsAdbService();

  if (DEV_NO_SERVER_CONNECT) {
    ui.goto('online');
  } else {
    log.info(`Device ${id} connecting to server ${api.config.serverUrl} ...`);
    assert(api.accessToken, 'must have access token');
    connections.start();
    server.connect();
  }

  // Yield a pinch of time since updates don't need to start immediately,
  // |update.start()| is currently a little main thread heavy, and there's lots
  // of other activity as the server connection is being established.
  await util.timeout(200);
  update.start();
}

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
    if (!btle) {
      return null;
    }
    log.info('BTLE shutdown');
    return btle.changeMode(btle.MODE_OFF);
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
    return null;
  });
}

// Update service...
update.on('staged', () => {
  // An OTA update is ready to be applied.  Start monitoring for UI idle
  function applyUpdate() {
    log.warn('Applying OTA update');
    shutdown(update.apply.bind(update));
  }

  if (ui.isIdle()) {
    log.verbose('ui is already idle');
    applyUpdate();
  } else {
    log.verbose('OTA update is staged, waiting for ui idle');
    ui.on('idle', applyUpdate);
  }
});

// UI...
ui.on('key:powerdown', shutdown);
factoryReset.on('factory-reset', () => {
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
let lastDogTick = util.uptime();
function watchdog() {
  let diff = util.uptime(lastDogTick);
  //log.warn('tick');
  if (diff > BOGGED_DOWN_MS) {
    log.warn(`====[ Main thread was bogged down for ${Math.round(diff - WATCHDOG_MS)}ms ]====`);
  }
  lastDogTick = util.uptime();
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
function runGC() {
  // Try to run the gc for less than this number of milliseconds

  let gcStart = util.uptime();
  let gcDone;
  let gcStop = gcStart;
  let gcIterations = 0;
  do {
    gcDone = gc1.idleNotification(GC_MAX_RUN_TIME);
    gcIterations++;
    gcStop = util.uptime();
  } while (!gcDone && (gcStop - gcStart < GC_MAX_RUN_TIME));

  log.verbose(`GC ran for ${gcStop - gcStart}ms | ` +
              `iterations=${gcIterations} done=${gcDone}`);

  // Look for new garbage in 20s if v8 says it's done, otherwise continue
  // collection after 5 seconds.
  setTimeout(runGC, gcDone ? 20 * 1000 : 5 * 1000);
}
runGC();
