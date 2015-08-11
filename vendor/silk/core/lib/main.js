/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let api = require('./api');
let btle = require('./btle');
let ui = require('./ui');
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
const logoFilePath = '/system/media/logo.png';

let id = null;
let logo = null;
let bootCompleted = false;
let shutdownPromise = null;
let crashreporter;
let outbox;

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
function _waitForBoot(startTime, defer) {
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
    setTimeout(_waitForBoot.bind(this, startTime, defer), BOOT_CHECK_INTERVAL);
  }

  return defer.promise;
}

function boot() {
  log.info('Wait for boot complete');
  return _waitForBoot().
    then(() => {
      log.info('Initialize hardware');
      return Promise.all([wifi.init(), btle.init(), sensors.init()]);
    }).
    then(() => {
      log.info('Load configuration');
      return config.init();
    });
}

/**
 * Wait for bootup and initialize the device.
 */
function main() {
  ui.goto('bootanimation');

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
let camera;
let diag;
let hue;

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
  readLogo()
  .then(() => {
    if (socket.connected) {
      socket.emit('info', { id: id.toString(), name: name, now: Date.now(), logo: logo} );
    }
  });
}
ntp.on('time', emitDeviceInfo);

function maybeCreateSocket() {
  if (!socket.__iamastub) {
    return;
  }

  camera = require('./camera')(id.toString());
  camera.on('error', () => {
    log.warn('Camera command errored out');
  });

  hue = require('./hue')();

  require('./ext')({
    camera: camera,
    hue: hue,
    sensors: sensors,
    vib: vib,
  });

  diag = require('./diag')(id.toString());

  socket = require('socket.io-client')(api.config.serverUrl,
      {autoConnect: false});
  socket.on('connect', () => {
    ui.goto('online');
    diag.start(socket);
    camera.start(socket);
    update.start();
    emitDeviceInfo();
  });
  socket.on('disconnect', e => {
    log.warn(`socket disconnect: ${e}`);
    update.stop();
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

  outbox.hintSocket = socket;
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

    wifi.online()
    .then(() => {
      maybeCreateSocket();

      log.info(`Device ${id} connecting to server ${api.config.serverUrl} ...`);
      socket.connect();
    })
    .catch(e => util.processthrow(e));
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
    .catch(e => util.processthrow(e));
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
