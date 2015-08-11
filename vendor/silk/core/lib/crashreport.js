/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let createReadStream = require('fs').createReadStream;
let fs = require('mz/fs');
let getboolprop = require('./util').getboolprop;
let log = require('./log')('crashreport');
let net = require('net');
let vib = require('./vibrator')();

const CRASHREPORT_ENABLED_PROP = 'persist.silk.crashrprt.enabled';

const CRASHREPORT_ENABLED = getboolprop(CRASHREPORT_ENABLED_PROP);
const DEBUGGERD_SOCKET_PATH = '/data/system/ndebugsocket';
const TOMBSTONE_DIR_PATH = '/data/tombstones/';
const TOMBSTONE_FILE_REGEXP = new RegExp(/^tombstone_\d+$/); // 'tombstone_03'

function formatError(err) {
  return `${err}:\n${err.stack}`;
}

class CrashReporter {
  constructor(outbox) {
    if (!CRASHREPORT_ENABLED) {
      log.info(`'${CRASHREPORT_ENABLED_PROP}' is unset, disabling crash ` +
               'reporting');
      return;
    }

    log.info('Starting');

    this.activePromise = null;
    this.fileQueue = null;
    this.fileSet = null;
    this.hasDeviceId = false;
    this.nextReportSerialNumber = 0;
    this.outbox = outbox;
    this.running = true;
    this.tombstoneServer = null;

    process.on('uncaughtException', this.uncaughtExceptionHandler.bind(this));

    // Start the server.
    this.chainToActivePromise(this.openTombstoneServer.bind(this));

    // Force a scan of the tombstone directory to pick up any tombstones that we
    // may have left unprocessed during the last run.
    this.chainToActivePromise(this.scanTombstoneDir.bind(this));
  }

  uncaughtExceptionHandler(err) {
    log.error(err + ': ' + err.stack);

    if (this.running) {
      const metadata = {
        deviceId: this.deviceId,
        timeStamp: new Date(),
        type: 'exception'
      };

      this.outbox.sendCrash(formatError(err), metadata, 'text/plain');
    }

    if (!vib.active) {
      vib.pattern(
        300, 200, 300, 200, 300, // S
        400,
        600, 200, 600, 200, 600, // O
        400,
        300, 200, 300, 200, 300, // S
        1000
      );
    }
    // TODO: Likely restart node here eventually
  }

  chainToActivePromise(promiseFactory) {
    if (this.activePromise) {
      this.activePromise = this.activePromise.catch(err => {
        // No error here means that something was canceled, and there's no
        // reason to log that.
        if (err) {
          log.warn(err);
        }

        // Always execute the next promise in the chain, even if the previous
        // chain had some kind of error.
        return Promise.resolve();
      })
      .then(promiseFactory);
    } else {
      this.activePromise = promiseFactory();
    }
  }

  processNextFile() {
    if (!this.fileQueue.length) {
      return Promise.resolve();
    }

    if (!this.running) {
      return Promise.reject();
    }

    let filename = this.fileQueue[0];
    let path = TOMBSTONE_DIR_PATH + filename;

    log.info(`Processing '${path}'`);

    return fs.stat(path)
      .then(stats => {
        const metadata = {
          deviceId: this.deviceId,
          timeStamp: stats.birthtime,
          type: 'tombstone'
        };

        return this.outbox.sendCrash(createReadStream(path),
                                     metadata,
                                     'text/plain',
                                     stats.size);
      })
      .then(() => {
        log.debug(`Unlinking '${path}'`);
        return fs.unlink(path);
      })
      .catch(err => {
        if (err) {
          log.warn(err);
          return;
        }
        throw err;
      })
      .then(() => {
        // Remove that tombstone from our arrays.
        this.fileQueue.splice(0, 1);
        this.fileSet.delete(filename);

        return this.processNextFile();
      });
  }

  scanTombstoneDir() {
    log.info(`Scanning '${TOMBSTONE_DIR_PATH}' directory for reportable ` +
             `errors`);

    return fs.readdir(TOMBSTONE_DIR_PATH)
      .catch(err => {
        // Ignore ENOENT.
        if (err && err.code === 'ENOENT') {
          return Promise.resolve([]);
        }
        return Promise.reject(err);
      })
      .then(files => {
        if (!this.running) {
          return Promise.reject();
        }

        let newErrorCount = 0;

        for (let file of files) {
          if (!this.fileSet.has(file) && TOMBSTONE_FILE_REGEXP.test(file)) {
            this.fileSet.add(file);
            this.fileQueue.push(file);
            newErrorCount++;
          }
        }

        log.info(`Found ${newErrorCount} error files to process`);

        if (newErrorCount && this.hasDeviceId) {
          return this.processNextFile();
        }

        return Promise.resolve();
      });
  }

  openTombstoneServer() {
    // Helper to wrap server.listen().
    let listenPromise = (server) => {
      return new Promise((resolve, reject) => {
        server.listen(DEBUGGERD_SOCKET_PATH, () => {
          if (!this.running) {
            server.close();
            reject();
          }
          resolve(server);
        });
      });
    };

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
        if (!this.running) {
          return Promise.reject();
        }

        log.debug(`Creating server for '${DEBUGGERD_SOCKET_PATH}' socket`);

        // Track each connection uniquely for logging purposes.
        let nextConnectionSerialNumber = 0;

        let server = net.createServer(socket => {
          let connectionSerialNumber = nextConnectionSerialNumber++;

          log.debug(`Connection ${connectionSerialNumber} started`);

          if (!this.running) {
            log.debug(`Connection ${connectionSerialNumber} started during ` +
                      'shutdown, ignoring');
            socket.end();
            return;
          }

          // TODO: Validate socket credentials? Android does this normally, but
          //       node doesn't have a good way to do it short of using libffi
          //       and calling some C functions...
          socket.on('error', (err) => {
            log.warn(`Connection ${connectionSerialNumber} error: ${err}`);
          })
          .on('close', () => {
            log.debug(`Connection ${connectionSerialNumber} ended`);

            if (!this.running) {
              log.debug(`Connection ${connectionSerialNumber} ended during ` +
                        'shutdown, ignoring');
              return;
            }

            // Now that another tombstone has been written we will rescan the
            // tombstone directory to pick up any new files.
            this.chainToActivePromise(this.scanTombstoneDir.bind(this));
          });
        });

        log.debug(`Attempting to listen to '${DEBUGGERD_SOCKET_PATH}' socket`);

        return listenPromise(server);
      })
      .then((server) => {
        this.fileQueue = [ ];
        this.fileSet = new Set();

        log.info(`Listening to '${DEBUGGERD_SOCKET_PATH}' socket`);
        this.tombstoneServer = server;
      });
  }

  closeTombstoneServer() {
    return new Promise((resolve, reject) => {
      if (!this.tombstoneServer) {
        resolve();
        return;
      }

      log.info(`Closing server for '${DEBUGGERD_SOCKET_PATH}' socket`);

      this.tombstoneServer.close(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
      this.tombstoneServer = null;
    });
  }

  get deviceId() {
    log.warn('Using 0-padded deviceId');
    return new Array(67).join('0');
  }

  set deviceId(val) {
    log.debug('Setting deviceId: %s', val);

    delete this.deviceId;

    Object.defineProperty(this, 'deviceId', {
      value: val,
      writable: false,
      configurable: true,
      enumerable: true
    });

    this.hasDeviceId = true;
    this.chainToActivePromise(this.processNextFile.bind(this));
  }

  shutdown() {
    if (!this.running) {
      return this.activePromise || Promise.resolve();
    }

    this.running = false;

    log.info('Shutting down');

    let promise = this.closeTombstoneServer()
      .catch(err => {
        if (err) {
          log.warn(err);
        }
      })
      .then(() => {
        this.activePromise = null;
        this.fileQueue = null;
        this.fileSet = null;
        this.outbox = null;

        log.info('Shutdown complete');
      });

    this.chainToActivePromise(promise);
    return promise;
  }
}

export default function makeCrashReporter(outbox) {
  let crashreporter = new CrashReporter(outbox);

  return {
    shutdown: crashreporter.shutdown.bind(crashreporter),

    set deviceId(val) {
      crashreporter.deviceId = val;
    },
    get deviceId() {
      return crashreporter.deviceId;
    },
  };
}
