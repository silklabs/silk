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
import Battery from 'silk-battery';
import wifi from 'silk-wifi';
import ntp from 'silk-ntp';
import {getUpdateController} from 'silk-update';
import config from './config';
import silkconfig from 'silk-config';
import sensors from 'silk-sensors';
import factoryReset from 'silk-factory-reset';
import infrared from './infrared';
import Connections from './connections';
import fs from 'mz/fs';
import say from 'silk-say';

import getBTLE from './btle/parent';
import getDeviceId from './deviceid';
import makeCrashReporter from './crash_reporter';
import Diag from './diag';
import type {DiagRebootEventData} from './diag';
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
import {
  default as getStore,
  loadStore,
} from './store';
import startPermissionManager from './permissions';
import startSystemMessageManager from './system_message_manager';

// Start the profile server ASAP.
initProfiler();

const startupMS = process.uptime() * 1000;

// Amount of time to wait for async shutdown before forcing power status change.
const SHUTDOWN_TIMEOUT_MS = 45 * 1000;

// If true, don't attempt to get configured or connect with the Silk server but
// otherwise try to be a functional as possible.
const DEV_NO_SERVER_CONNECT = util.getboolprop('persist.silk.dev.no_server', false);

const update = getUpdateController();

let battery = new Battery();
let id = null;
let btle = null;
let timeline;
let camera;
let connections = null;
type ShutdownType = 'poweroff' | 'otaupdate' | 'factoryreset';
let shutdownType: ?ShutdownType = null;
let crashreporter;
let outbox;
let logcat;
let diag;

// true once the device has a configuration and is ready for normal operation
let configured = false;

// true if the device has ever been in an unconfigured state since boot.
let wasUnconfigured = false;

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
      if (shutdownType) {
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
  connections.on('connect', () => {
    netstatusOrStub.check();
    ui.goto('online');
  });
  connections.on('disconnect', () => {
    netstatusOrStub.check();
    ui.goto('connecting');
  });
  netstatusOrStub.on('online', () => connections.reconnect());
  outbox = initOutbox(netstatusOrStub);

  crashreporter = makeCrashReporter(outbox);
  jsErrors(crashreporter);

  diag = new Diag(connections.getChannel('diag'));

  // Init metrics...
  netstatusOrStub.on('online', api.metrics.onConnectivityChange);
  netstatusOrStub.on('offline', api.metrics.onConnectivityChange);
  if (!DEV_NO_SERVER_CONNECT) {
    api.metrics.start();
  }

  startCollectingProcessMetrics();

  const bootAbortedFlag = Symbol();
  const maybeAbortBoot = () => {
    if (shutdownType) {
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

  return loadStore()
    .then(() => {
      log.info(`State`, getStore().getState());
    })
    .then(() => {
      api.accessToken = id = getDeviceId();
      crashreporter.assignDeviceId(id);
      logcat = new Logcat(id.toString(), outbox);
      logcat.start();

      const permissions = startPermissionManager();

      startSystemMessageManager(id, connections, permissions);

      // Wait for the battery to initialize and block until there's enough
      // capacity to fully boot.
      return battery.init();
    })
    .then(maybeAbortBoot)
    .then(() => {
      log.info('Initialize hardware');

      camera = new Camera(silkconfig);
      camera.attachFrameReplacer(
        new CameraClipRecorder(camera, connections.getChannel('diag'))
      );

      timeline = new Timeline(outbox, camera, {
        diag: connections.getChannel('diag'),
        mic: connections.getChannel('mic'),
        objects: connections.getChannel('objects'),
        video: connections.getChannel('video'),
      });

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
      await makeExtensions({
        btle: btle,
        camera: camera,
        sensors: sensors,
        infrared: infrared,
        timeline: timeline,
        ui: ui,
        say: say,
        dialogChannel: connections.getChannel('app'), // Very sorry!! Remove once connections.js is moved into its own module
      });
    })
    .then(maybeAbortBoot)
    .then(() => {
      if (!DEV_NO_SERVER_CONNECT) {
        log.info('Load configuration');
        return config.init(connections);
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
      api.metrics.add(new JSStartup(startupMS, bootTimeS * 1000));
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
ntp.on('time', () => log.info('NTP time acquired'));

// Config service...
config.on('unconfigured', () => {
  configured = false;
  wasUnconfigured = true;
  if (ui.goto('unconfigured')) {
    camera.stopRecording();
    connections.stop();
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
  }

  diag.start();
  diag.on('reboot', (data: DiagRebootEventData) => {
    switch (data.channel) {
    case 'master':
    case 'next':
    case 'release':
      log.info('  reboot: setting update channel to', data.channel);
      util.setprop('persist.silk.update.channel', data.channel);
      // When moving the device to a new update channel, it's likely that the
      // serverUrl received from the app during initial configuration time will
      // no longer be valid for the new update channel.  Clearing the serverUrl
      // here reverts the device back to using the default server supplied by the
      // current update channel.
      config.forceDefaultServerUrl();
      break;
    default:
      break;
    }
    log.info('rebooting ...');
    util.setprop('sys.powerctl', 'reboot');
  });

  // Yield a pinch of time since updates don't need to start immediately,
  // |update.start()| is currently a little main thread heavy, and there's lots
  // of other activity as the server connection is being established.
  await util.timeout(200);
  update.start();
}

export async function shutdown(type: ShutdownType = 'poweroff') {
  if (shutdownType) {
    log.warn('Shutdown already in progress: ', shutdownType);
    return;
  }
  shutdownType = type;

  log.info('Shutdown started', type);
  if (!ui.goto('powerdown')) {
    log.error(`ui state was set to 'powerdown' more than once?`);
  }

  const STATUS_COMPLETE = 'complete';
  const STATUS_EXCEPTION = 'exception';
  const STATUS_TIMEOUT = 'timeout';

  camera.stopRecording();
  connections.stop();

  if (shutdownType === 'factoryreset') {
    try {
      const result = await api.device.unregister();
      log.info('Server unregistration', result.success ? 'succeeded' : 'failed');
    } catch (err) {
      log.warn('Unable to unregister device:', err);
    }
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

  Promise.race([ timeoutPromise, asyncWorkPromise ])
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

    let shutdownPromise;
    switch (shutdownType) {
    case 'otaupdate':
      shutdownPromise = update.apply();
      break;
    case 'factoryreset':
      shutdownPromise = util.exec('librecovery_test', ['factoryReset']);
      break;
    default:
      shutdownPromise = Promise.resolve();
      break;
    }

    return shutdownPromise
    .catch(err => {
      log.warn(`Shutdown promise rejected: ${err}`);
    })
    .then(() => {
      log.info('Powering off');
      util.setprop('sys.powerctl', 'shutdown');
    });
  });
}

// Update service...
update.on('status', (info) => {
  assert(info.state === update.state);
  if (info.state !== 'staged') {
    return;
  }
  log.verbose('OTA update staged');

  // An OTA update is ready to be applied.  Start monitoring for UI idle
  function applyUpdate() {
    // If we just configured then we don't delay reboot, even if someone is
    // connected.
    if (!wasUnconfigured) {
      // There's currently no notification when peers connect/disconnect so just
      // check for any peers right before an update is about to get applied and
      // maybe try again later
      if (connections.peerConnected) {
        log.verbose('1 or more RTC peers connected, simulating ui activity');
        ui.userActivity();
        return;
      }

      if (config.activeSessionCount) {
        log.verbose(`${config.activeSessionCount} active bluetooth ` +
                    `connections, simulating ui activity`);
        ui.userActivity();
        return;
      }
    }

    ui.removeListener('idle', applyUpdate);

    log.warn('Applying OTA update');
    shutdown('otaupdate');
  }

  if (wasUnconfigured) {
    applyUpdate();
  } else {
    ui.addListener('idle', applyUpdate);
    if (ui.isIdle()) {
      log.verbose('ui is already idle');
      applyUpdate();
    }
  }
});

// UI...
ui.on('key:powerdown', shutdown);
factoryReset.on('factory-reset', async () => {
  log.warn('!! Factory reset !!');
  shutdown('factoryreset');
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
