/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let ui = require('./ui');
ui.goto('bootanimation');

// Activate source map support to exception stack traces as early as practical
// in the boot sequence
let v8PrepareStackTrace = Error.prepareStackTrace;
require('source-map-support').install();

let api = require('./api');
let battery = require('./battery');
let btle = require('./btle');
let log = require('./log')('main');
let vib = require('./vibrator')();
let wifi = require('./wifi');
let ntp = require('./ntp');
let util = require('./util');
let update = require('./update');
let config = require('./config');
let sensors = require('./sensors');
let path = require('path');
let fs = require('mz/fs');
let deferred = require('./deferred');
let mkdirp = require('mkdirp-promise');
let clapper = require('./clapper');

import makeCrashReporter from './crashreport';
import makeOutbox from './outbox';

// Wait for 60 seconds for boot before issuing a warning.
const BOOT_TIMEOUT = 60 * 1000;
// How frequently (in ms) we check if the boot prop has been set.
const BOOT_CHECK_INTERVAL = 1000;
// Where the ID export for this device lives.
const ID_DIR = '/data/silk/config/';
const ID_PATH = path.join(ID_DIR, 'id.json');
// Amount of time to wait for async shutdown before forcing power status change.
const SHUTDOWN_TIMEOUT_MS = 30 * 1000;

const name = util.getprop('persist.silk.displayName', 'Silkcam');
const logoFilePath = '/system/silk/media/logo.png';

let id = null;
let timeline;
let camera;
let logo = null;
let bootCompleted = false;
let shutdownPromise = null;
let crashreporter;
let outbox;
let clapDetector;
let ext;
let diag;
let hue;

/**
 * Read or create a new device id this will be persisted between boots.
 *
 * Note: This current pattern of storing to disk may not be secure enough for
 * production.
 */
function readOrCreateID() {

  function createID() {
    let newId = api.id.create();
    return mkdirp(ID_DIR)
      .then(() => fs.writeFile(ID_PATH, newId.export()))
      .then(() => newId);
  }

  function getID() {
    return fs.readFile(ID_PATH, 'utf8')
      .then(contents => {
        return api.id.import(contents);
      });
  }

  // check if the id exists already...
  return fs.exists(ID_PATH)
   .then(getID)
   .catch(createID);
}

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
    }).
    then(() => {
      log.info('Initialize hardware');
      return Promise.all([
        wifi.init(),
        btle.init(),
        sensors.init(),
      ]);
    }).
    then(() => {
      log.info('Initialize framework');

      // It's preferable to kill this process over system daemons
      // (usually running as -17) in out of memory situations.
      fs.writeFile('/proc/self/oom_adj', 0);

      timeline = require('./timeline')(id.toString());
      camera = require('./camera')(timeline);
      camera.on('error', () => {
        log.warn('Camera command errored out');
      });
      camera.start();

      diag = require('./diag')(id.toString());

      clapDetector = new clapper.ClapDetector({}, timeline);
      camera.on('mic-data', pkt => clapDetector.processPcmFrames(pkt.frame));

      log.info('Load configuration');
      return config.init();
    });
}

/**
 * Wait for bootup and initialize the device.
 */
function main() {
  // Start these ASAP so that unhandled exceptions in the boot sequence will
  // be properly recorded.
  outbox = makeOutbox(wifi);
  crashreporter = makeCrashReporter(outbox);

  return readOrCreateID()
    .then(fetchedId => {
      id = fetchedId;
      log.info('device id:', id.toString());
      crashreporter.deviceId = id.toString();
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
});

//
// State observers
//

let socket = { __iamastub: true, connected: false, disconnect: () => {} };

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
    if (socket.connected) {
      socket.emit('info', {
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

function maybeCreateSocket() {
  if (!socket.__iamastub) {
    return;
  }

  api.socketio.address().then(result => {
    socket = require('socket.io-client')(
      result.url,
      {
        // Require explicit connections.
        autoConnect: true,
        /**
         * Only use websockets this is important for the following reasons:
         *
         *   - it's faster by bypassing the upgrade check
         *
         *   - works around various bugs where we send base64 via polling which
         *     native does not decode correctly.
         *
         *   - More deterministic behavior since we don't sometimes use polling
         *     and sometimes use websockets.
         */
        transports: ['websocket']
      }
    );

    socket.on('connect', () => {
      ui.goto('online');
      emitDeviceInfo()
      .then(() => {
        log.warn(`server socket connected`);
        diag.start(socket);
        update.start();
        timeline.socket = socket;
      })
      .catch(util.processthrow);
    });
    socket.on('disconnect', e => {
      log.warn(`server socket disconnect: ${e}`);
      update.stop();
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

    outbox.hintSocket = socket;
  }).catch(util.processthrow);
}

// Config service...
config.on('unconfigured', () => {
  if (ui.goto('setup')) {
    socket.disconnect();
    config.configure(id)
    .catch(util.processthrow);
  }
});
config.on('configured', () => {
  if (ui.goto('connecting')) {

    wifi.online()
    .then(() => {
      maybeCreateSocket();
      log.info(`Device ${id} connecting to server ${api.config.serverUrl} ...`);
    })
    .then(util.timeout) // 0ms timer to enable others to run if needed.
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
        require('./ext')({
          camera: camera,
          hue: hue,
          sensors: sensors,
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
      return crashreporter.shutdown();
    })
    .then(() => {
      if (socket) {
        log.debug('Disconnecting socket');
        socket.disconnect();
        outbox.hintSocket = null;
        socket = null;
      }
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
