/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let createReadStream = require('fs').createReadStream;
let fs = require('mz/fs');
let getprop = require('./util').getprop;
let log = require('./log')('crashreport');
let net = require('net');
let vib = require('./vibrator')();

const CRASHREPORT_ENABLED_PROP = 'persist.silk.crashrprt.enabled';

const CRASHREPORT_ENABLED = getprop(CRASHREPORT_ENABLED_PROP) !== '';
const DEBUGGERD_SOCKET_PATH = '/data/system/ndebugsocket';
const EXCEPTION_FILE_MAX = 100;
const EXCEPTION_FILE_REGEXP = new RegExp(/^exception_\d+$/); // 'exception_02'
const TOMBSTONE_DIR_PATH = '/data/tombstones/';
const TOMBSTONE_FILE_REGEXP = new RegExp(/^tombstone_\d+$/); // 'tombstone_03'

let activePromise = null;
let nextReportSerialNumber = 0;
let running = false;
let serverSocket = null;
let fileQueue = null;
let fileSet = null;
let tombstoneServer = null;

function formatError(err) {
  return `${err}:\n${err.stack}`;
}

function saveExceptionToTombstoneDir(err) {
  function findUnusedFilename(counter, oldestMTime, oldestFilename) {
    counter = counter || 0;

    // Use the same naming convention as tombstones.
    function padNumber(number) {
      let str = number.toString();
      while (str.length < 2) {
        str = '0' + str;
      }
      return str;
    }

    let filename = TOMBSTONE_DIR_PATH + 'exception_' + padNumber(counter);

    return fs.stat(filename)
    .then(stats => {
      // The filename exists already.

      // If we have recursed too many times then we should just stop trying to
      // find an unused filename and simply rewrite the oldest.
      if (counter === EXCEPTION_FILE_MAX - 1) {
        log.info('Maximum number of exception files exist, replacing the ' +
                 'oldest');
        return Promise.resolve(oldestFilename);
      }

      // Update the oldest mtime.
      if (!oldestMTime || (stats.mtime < oldestMTime)) {
        oldestMTime = stats.mtime;
        oldestFilename = filename;
      }

      // Try the next filename.
      return findUnusedFilename(counter + 1, oldestMTime, oldestFilename);
    })
    .catch(statErr => {
      if (statErr && statErr.code === 'ENOENT') {
        // We found a filename that doesn't exist.
        return Promise.resolve(filename);
      }
    });
  }

  // First check to see if the tombstone directory exists.
  return fs.stat(TOMBSTONE_DIR_PATH)
  .catch(statErr => {
    if (statErr && statErr.code === 'ENOENT') {
      // Create the tombstone directory.
      return fs.mkdir(TOMBSTONE_DIR_PATH);
    }
  })
  .then(() => findUnusedFilename())
  .then(filename => {
    log.info(`Saving exception to '${filename}'`);
    return fs.writeFile(filename, formatError(err));
  })
  .catch(writeErr => {
    log.warn(`Failed to write ${err} to disk: ${writeErr}`);
  });
}

process.on('uncaughtException', err => {
  log.error(err + ': ' + err.stack);

  if (running) {
    let emitData = {
      id: nextReportSerialNumber++,
      type: 'exception',
      data: formatError(err)
    };

    serverSocket.emit('crashreport', emitData);
  } else {
    saveExceptionToTombstoneDir(err);
  }

  vib.pattern(
    300, 200, 300, 200, 300, // S
    400,
    600, 200, 600, 200, 600, // O
    400,
    300, 200, 300, 200, 300  // S
  );
  // TODO: Likely restart node here eventually
});

function chainToActivePromise(promiseFactory) {
  if (activePromise) {
    activePromise = activePromise.catch(err => {
      // No error here means that something was canceled, and there's no reason
      // to log that.
      if (err) {
        log.warn(err);
      }

      // Always execute the next promise in the chain, even if the previous
      // chain had some kind of error.
      return Promise.resolve();
    })
    .then(promiseFactory);
  } else {
    activePromise = promiseFactory();
  }
}

// Simple wrapper around fs.createReadStream that checks the |running| flag so
// that it can be interrupted at shutdown.
function createCancelableReadStream(path) {
  return new Promise((resolve, reject) => {
    let hadError = false;
    let chunks = [];

    let stream = createReadStream(path);
    stream.on('error', err => {
      hadError = true;
      reject(err);
    })
    .on('readable', () => {
      let chunk;
      while (running && !hadError && (null !== (chunk = stream.read()))) {
        chunks.push(chunk);
      }
    })
    .on('end', () => {
      if (hadError) {
        // Should have rejected already.
        return;
      }

      if (running) {
        // Glue everything together.
        resolve(Buffer.concat(chunks));
      } else {
        // Canceled.
        reject();
      }
    });
  });
}

function processNextFile() {
  if (!fileQueue.length) {
    return Promise.resolve();
  }

  let filename = fileQueue[0];
  let path = TOMBSTONE_DIR_PATH + filename;

  log.info(`Processing '${path}'`);

  return createCancelableReadStream(path)
  .then(data => {
    if (!running) {
      return Promise.reject();
    }

    log.info(`Uploading ${data.length} byte report`);

    let emitData = {
      id: nextReportSerialNumber++,
      type: TOMBSTONE_FILE_REGEXP.test(filename) ? 'tombstone' : 'exception',
      data: data
    };

    serverSocket.emit('crashreport', emitData);

    // Remove that tombstone from our arrays.
    fileQueue.splice(0, 1);
    fileSet.delete(filename);

    return fs.unlink(path);
  })
  .then(() => {
    if (!fileQueue.length) {
      return Promise.resolve();
    }

    if (!running) {
      return Promise.reject();
    }

    return processNextFile();
  });
}

function scanTombstoneDir() {
  log.info(`Scanning '${TOMBSTONE_DIR_PATH}' directory for reportable errors`);

  return fs.readdir(TOMBSTONE_DIR_PATH)
  .catch(err => {
    // Ignore ENOENT.
    if (err && err.code === 'ENOENT') {
      return Promise.resolve([]);
    }
    return Promise.reject(err);
  })
  .then(files => {
    if (!running) {
      return Promise.reject();
    }

    let newErrorCount = 0;

    for (let file of files) {
      if (!fileSet.has(file) &&
          (TOMBSTONE_FILE_REGEXP.test(file) ||
           EXCEPTION_FILE_REGEXP.test(file))) {
        fileSet.add(file);
        fileQueue.push(file);
        newErrorCount++;
      }
    }

    log.info(`Found ${newErrorCount} error files to process`);

    if (newErrorCount) {
      return processNextFile();
    }

    return Promise.resolve();
  });
}

function openTombstoneServer() {
  // Helper to wrap server.listen().
  function listenPromise(server) {
    return new Promise((resolve, reject) => {
      server.listen(DEBUGGERD_SOCKET_PATH, () => {
        if (!running) {
          server.close();
          reject();
        }
        resolve(server);
      });
    });
  }

  // Always start by removing the socket file from disk.
  return fs.unlink(DEBUGGERD_SOCKET_PATH)
  .catch(err => {
    // Ignore ENOENT.
    if (err && err.code === 'ENOENT') {
      return Promise.resolve();
    }
    return Promise.reject(err);
  })
  .then(() => {
    if (!running) {
      return Promise.reject();
    }

    log.info(`Creating server for '${DEBUGGERD_SOCKET_PATH}' socket`);

    // Track each connection uniquely for logging purposes.
    let nextConnectionSerialNumber = 0;

    let server = net.createServer(socket => {
      let connectionSerialNumber = nextConnectionSerialNumber++;

      log.info(`Connection ${connectionSerialNumber} started`);

      if (!running) {
        log.warn(`Connection ${connectionSerialNumber} started during ` +
                 'shutdown, ignoring');
        socket.end();
        return;
      }

      // TODO: Validate socket credentials? Android does this normally, but
      //       node doesn't have a good way to do it short of using libffi and
      //       calling some C functions...
      socket.on('error', (err) => {
        log.warn(`Connection ${connectionSerialNumber} error: ${err}`);
      })
      .on('close', () => {
        log.info(`Connection ${connectionSerialNumber} ended`);

        if (!running) {
          log.info(`Connection ${connectionSerialNumber} ended during ` +
                   'shutdown, ignoring');
          return;
        }

        // Now that another tombstone has been written we will rescan the
        // tombstone directory to pick up any new files.
        chainToActivePromise(scanTombstoneDir);
      });
    });

    log.info(`Attempting to listen to '${DEBUGGERD_SOCKET_PATH}' socket`);

    return listenPromise(server);
  })
  .then((server) => {
    fileQueue = [ ];
    fileSet = new Set();

    log.info(`Listening to '${DEBUGGERD_SOCKET_PATH}' socket`);
    tombstoneServer = server;
  });
}

function closeTombstoneServer() {
  return new Promise((resolve, reject) => {
    if (!tombstoneServer) {
      resolve();
      return;
    }

    log.info(`Closing server for '${DEBUGGERD_SOCKET_PATH}' socket`);

    tombstoneServer.close(err => {
      activePromise = null;
      serverSocket = null;
      fileQueue = null;
      fileSet = null;

      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });

    tombstoneServer = null;
  });
}

function start(socket) {
  if (running) {
    return Promise.resolve();
  }

  if (!CRASHREPORT_ENABLED) {
    log.warn(`'${CRASHREPORT_ENABLED_PROP}' is unset, disabling crash ` +
             'reporting');
    return Promise.resolve();
  }

  running = true;

  log.info('Starting crashreport service');

  serverSocket = socket;

  // Start the server.
  chainToActivePromise(openTombstoneServer);

  // Grab the 'openTombstoneServer' promise to return to the caller.
  let promise = activePromise;

  // Force a scan of the tombstone directory to pick up any tombstones that we
  // may have left unprocessed during the last run.
  chainToActivePromise(scanTombstoneDir);

  return promise;
}

function stop() {
  if (!running) {
    return activePromise || Promise.resolve();
  }

  running = false;

  log.info('Stopping crashreport service');

  // Always make sure to close the server.
  chainToActivePromise(closeTombstoneServer);

  return activePromise;
}

module.exports = {
  start: start,
  stop: stop
};
