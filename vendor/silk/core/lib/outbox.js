/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

let api = require('./api');
let assert = require('assert');
let { createReadStream, createWriteStream } = require('fs');
let fs = require('mz/fs');
let log = require('./log')('outbox');
let path = require('path');
let Readable = require('stream').Readable;

const CONTENT_TYPE_UNKNOWN = 'application/octet-stream';

const FILENAME_BLOB = 'blob';
const FILENAME_METADATA = 'metadata';

const PROPERTY_URL = 'url';

const STATE_CONNECTED = 'online';
const STATE_DISCONNECTED = 'offline';

/**
 * This service stores blobs and metadata on disk in this structure:
 *
 *   - ${STORAGE_PATH}/
 *     - 0/
 *       - blob
 *       - metadata
 *     - 1/
 *       - blob
 *       - metadata
 *     - ...
 *
 * On startup the STORAGE_PATH location is enumerated and all subfolders that
 * have the required files present are staged for upload. Any files or folders
 * that do not conform to this structure are ignored.
 */
const STORAGE_PATH = path.join('/data', 'outbox');

const REPORT_TYPE_CRASH = 'crashreport';

const HIDDEN_PROPERTY_REPORTTYPE = '__reportType__';
const HIDDEN_PROPERTY_CONTENTLENGTH = '__contentLength__';
const HIDDEN_PROPERTY_CONTENTTYPE = '__contentType__';

const HIDDEN_PROPERTIES = [
  HIDDEN_PROPERTY_REPORTTYPE,
  HIDDEN_PROPERTY_CONTENTLENGTH,
  HIDDEN_PROPERTY_CONTENTTYPE
];

const requiredFiles = [ FILENAME_BLOB, FILENAME_METADATA ];
const timeoutDelayMax = 1000 * 60 * 60; // 1 hour

class BufferReadable extends Readable {
  constructor(buffer) {
    super();
    this.buffer = buffer;
  }

  _read() {
    let buffer = this.buffer;
    this.buffer = null;
    this.push(buffer);
  }
}

function realPropertyName(name) {
  return name.substring(2, name.length - 2);
}

function addHiddenProperties(dest, src) {
  HIDDEN_PROPERTIES.forEach(hiddenProp => {
    dest[hiddenProp] = src[realPropertyName(hiddenProp)];
  });
}

function removeHiddenProperties(src) {
  let removed = { };
  HIDDEN_PROPERTIES.forEach(hiddenProp => {
    removed[realPropertyName(hiddenProp)] = src[hiddenProp];
    delete src[hiddenProp];
  });
  return removed;
}

function containsSubset(array, subset) {
  if (array.length < subset.length) {
    return false;
  }
  for (let item of subset) {
    if (array.indexOf(item) === -1) {
      return false;
    }
  }
  return true;
}

function commonCatch(err) {
  if (err) {
    log.warn(err.stack || err.msg || err);
    return undefined;
  }
  log.debug('No longer running');
  throw err;
}

function ignoreErrorCodes(...codes) {
  return err => {
    if (!err || codes.indexOf(err.code) === -1) {
      throw err;
    }
  };
}

function unlink(filePath) {
  return Promise.resolve()
    .then(() => {
      log.debug(`Unlinking '${filePath}'`);
      return fs.unlink(filePath);
    })
    .catch(ignoreErrorCodes('ENOENT'));
}

function rmdir(directoryPath) {
  return Promise.resolve()
    .then(() => {
      log.debug(`Removing directory '${directoryPath}'`);
      return fs.rmdir(directoryPath);
    });
}

function pipePromise(readable, writable) {
  return new Promise((resolve, reject) => {
    readable.pipe(writable)
      .on('error', reject)
      .on('finish', resolve);
  });
}

class Outbox {
  constructor(wifi) {
    assert(wifi, 'Must have wifi!');

    log.info('Starting');

    this.activePromise = null;
    this.backoffTimeoutInfo = null;
    this.directoryQueue = [ ];
    this._hintSocket = null;
    this.nextDirectoryId = 0;
    this.nextTimeoutDelay = 0;
    this.running = true;
    this.wifiState = STATE_DISCONNECTED;

    wifi.on(STATE_CONNECTED, () => {
      log.info('Connected to wifi');
      this.wifiState = STATE_CONNECTED;
      this.chainToActivePromise(this.processNextDirectory.bind(this));
    })
    .on(STATE_DISCONNECTED, () => {
      log.info('Disconnected from wifi');
      this.wifiState = STATE_DISCONNECTED;
    });

    this.chainToActivePromise(this.initializeStorage.bind(this));
  }

  // We want to make sure that we can always know "the latest promise" so that
  // we keep everything in order and can have proper shutdown.
  chainToActivePromise(promiseFactory) {
    if (this.activePromise) {
      this.activePromise = this.activePromise.catch(err => {
        // No error here means that something was canceled, and there's no
        // reason to log that.
        if (err) {
          log.error(err);
        }
      })
      .then(promiseFactory);
    } else {
      this.activePromise = promiseFactory();
    }
  }

  increaseBackoffTimeout() {
    if (this.nextTimeoutDelay) {
      this.nextTimeoutDelay = Math.min(timeoutDelayMax,
                                       this.nextTimeoutDelay * 2);
    } else {
      this.nextTimeoutDelay = 1000;
    }
    log.debug('Increasing timeout due to network failure: ' +
              this.nextTimeoutDelay);
  }

  resetBackoffTimeout() {
    if (this.nextTimeoutDelay) {
      log.debug('Disabling timeout after network success');
      this.nextTimeoutDelay = 0;
    }
  }

  removeDirectory(paths) {
    return Promise.resolve()
      .then(() => {
        assert(paths.directory ===
                 path.join(STORAGE_PATH, this.directoryQueue[0]));
        this.directoryQueue.splice(0, 1);

        return Promise.all([
          unlink(paths.blob),
          unlink(paths.meta)
        ]);
      })
      .then(() => rmdir(paths.directory))
      .catch(commonCatch);
  }

  waitForBackoffTimer() {
    return new Promise((resolve, reject) => {
      assert(!this.backoffTimeoutInfo, 'This should never happen');

      let timeout;

      function finish(callback) {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
          this.backoffTimeoutInfo = null;
          callback();
        }
      }

      this.backoffTimeoutInfo = {
        cancel: finish.bind(this, reject),
        skip: finish.bind(this, resolve)
      };

      timeout = setTimeout(finish.bind(this, resolve), this.nextTimeoutDelay);
    });
  }

  uploadBlob(blob, metadata, reportInfo) {
    return Promise.resolve()
      .then(() => {
        log.info('Uploading blob');
        return api.blob.upload(reportInfo.reportType,
                               reportInfo.contentLength,
                               reportInfo.contentType,
                               blob);
      })
      .then(blobUrl => {
        log.info(`Blob uploaded to ${blobUrl}`);
        this.resetBackoffTimeout();
        return blobUrl;
      })
      .catch(err => {
        commonCatch(err);
        this.increaseBackoffTimeout();
        return undefined;
      });
  }

  uploadMetadata(metadata, reportType, blobUrl) {
    return Promise.resolve()
      .then(() => {
        metadata.url = blobUrl;

        log.info('Uploading metadata');
        switch (reportType) {
          case REPORT_TYPE_CRASH:
            return api.crashMeta.put(metadata);
          default:
            throw new Error(`Unsupported report type: ${reportType}`);
        }
      })
      .then(() => {
        log.info('Metadata uploaded');
        this.resetBackoffTimeout();
        return blobUrl;
      })
      .catch(err => {
        commonCatch(err);
        this.increaseBackoffTimeout();
        return undefined;
      });
  }

  upload(blob, metadata, reportInfo) {
    return this.uploadBlob(blob, metadata, reportInfo)
      .then(blobUrl => {
        if (blobUrl) {
          return this.uploadMetadata(metadata, reportInfo.reportType, blobUrl);
        }
        return undefined;
      });
  }

  readBlob(paths, results) {
    return Promise.resolve()
      .then(() => {
        log.debug(`Reading blob from '${paths.blob}'`);
        return fs.stat(paths.blob);
      })
      .then(stats => {
        if (!this.running) {
          throw undefined;
        }

        if (stats.size !== results.reportInfo.contentLength) {
          log.warn(`'${paths.blob}' size (${stats.size}) does not match ` +
                   `reportInfo contentLength ` +
                   `(${results.reportInfo.contentLength})`);
          results.reportInfo.contentLength = stats.size;
        }

        return results;
      })
      .catch(err => {
        commonCatch(err);
        return this.removeDirectory(paths);
      });
  }

  readMetadata(paths) {
    return Promise.resolve()
      .then(() => {
        log.debug(`Reading metadata from '${paths.meta}'`);
        return fs.readFile(paths.meta);
      })
      .then(fileData => {
        if (!this.running) {
          throw undefined;
        }

        let metadata = JSON.parse(fileData);
        if (!metadata) {
          throw new Error(`'${paths.meta}' is corrupted`);
        }

        let reportInfo = removeHiddenProperties(metadata);
        return { metadata, reportInfo };
      })
      .catch(err => {
        commonCatch(err);
        return this.removeDirectory(paths);
      });
  }

  processNextDirectory() {
    if (!this.running) {
      throw undefined;
    }

    if (!this.directoryQueue.length) {
      log.debug('Nothing to upload');
      return undefined;
    }

    if (this.wifiState !== STATE_CONNECTED) {
      log.debug('Cannot upload until connected');
      return undefined;
    }

    const directoryPath = path.join(STORAGE_PATH, this.directoryQueue[0]);

    const paths = {
      directory: directoryPath,
      meta: path.join(directoryPath, FILENAME_METADATA),
      blob: path.join(directoryPath, FILENAME_BLOB)
    };

    return this.waitForBackoffTimer()
      .then(() => this.readMetadata(paths))
      .then(results => {
        if (results) {
          return this.readBlob(paths, results);
        }
        return undefined;
      })
      .then(results => {
        if (results) {
          return this.upload(createReadStream(paths.blob),
                              results.metadata,
                              results.reportInfo);
        }
        return undefined;
      })
      .then(blobUrl => {
        if (blobUrl) {
          return this.removeDirectory(paths);
        }
        return undefined;
      })
      .then(() => {
        let promiseFactory = this.processNextDirectory.bind(this);
        return this.chainToActivePromise(promiseFactory);
      });
  }

  initializeFiles(directory) {
    const directoryPath = path.join(STORAGE_PATH, directory);

    // Stat each required file to make sure that they're all valid.
    return Promise.all(
      requiredFiles.map(file => {
        const filePath = path.join(directoryPath, file);

        return Promise.resolve()
          .then(() => {
            log.debug(`Examining '${filePath}'`);
            return fs.stat(filePath);
          })
          .then(stats => {
            // Maybe bail out.
            if (!this.running) {
              throw undefined;
            }

            // Currently we just verify that this is a file and not a directory,
            // but we can add additional verification later.
            return { filePath,
                     isDirectory: stats.isDirectory() };
          });
      }))
      .then(results => {
        let verified = true;

        for (let result of results) {
          if (result.isDirectory) {
            log.warn(`'${result.filePath}' is a directory, ignoring`);
            verified = false;
          }
        }

        if (verified) {
          log.info(`Staging '${directoryPath}' for upload`);
          this.directoryQueue.push(directory);
        }
      })
      .catch(commonCatch);
  }

  initializeDirectory(directory) {
    const directoryPath = path.join(STORAGE_PATH, directory);

    // All of our queued directories should have simple integer names.
    let directoryId = parseInt(directory);
    if (isNaN(directoryId)) {
      log.warn(`'${directoryPath}' is unexpected, ignoring`);
      return undefined;
    }

    // Keep track of the next directory name we will use.
    this.nextDirectoryId = Math.max(this.nextDirectoryId, directoryId + 1);

    // Check to make sure that this directory contains all the required files.
    return Promise.resolve()
      .then(() => {
        log.debug(`Scanning '${directoryPath}'`);
        return fs.readdir(directoryPath);
      })
      .catch(ignoreErrorCodes('ENOTDIR'))
      .then(files => {
        // Maybe bail out.
        if (!this.running) {
          throw undefined;
        }

        if (!files) {
          log.warn(`'${directoryPath}' is not a directory, ignoring`);
          return undefined;
        }

        if (!containsSubset(files, requiredFiles)) {
          log.warn(`'${directoryPath}' does not contain the required files (%j)` +
                   ': %j',
                   requiredFiles,
                   files);
          return undefined;
        }

        if (files.length > requiredFiles.length) {
          let ignoredFiles =
            files.filter(item => requiredFiles.indexOf(item) === -1);
          log.warn(`'${directoryPath}' contains unknown files that will be ` +
                   'ignored: %j',
                   ignoredFiles);
        }

        return this.initializeFiles(directory);
      })
      .catch(commonCatch);
  }

  initializeStorage() {
    // Enumerate the main storage directory to find directories that may contain
    // files to upload.
    return Promise.resolve()
      .then(() => {
        log.info(`Scanning '${STORAGE_PATH}'`);
        return fs.readdir(STORAGE_PATH);
      })
      .catch(err => {
        // Ignore ENOENT.
        if (!err || err.code !== 'ENOENT') {
          throw err;
        }
      })
      .then(directories => {
        // Maybe bail out.
        if (!this.running) {
          throw undefined;
        }

        if (!directories) {
          log.debug(`'${STORAGE_PATH}' does not exist`);
          return undefined;
        }

        if (!directories.length) {
          log.debug(`'${STORAGE_PATH}' is empty`);
          return undefined;
        }

        let callback = this.initializeDirectory.bind(this);
        return Promise.all(directories.map(callback));
      })
      .then(() => {
        log.info('Initialization complete');

        this.directoryQueue.sort((a, b) => parseInt(a) - parseInt(b));
        log.debug(`Wifi state: '%s', queue: %j`,
                  this.wifiState,
                  this.directoryQueue);

        if (this.directoryQueue.length && this.wifiState === STATE_CONNECTED) {
          this.chainToActivePromise(this.processNextDirectory.bind(this));
        }
      })
      .catch(err => {
        this.running = false;
        commonCatch(err);
      });
  }

  saveToDisk(blob, metadata, reportInfo) {
    return Promise.resolve()
      .then(() => {
        log.debug(`Creating '${STORAGE_PATH}'`);
        return fs.mkdir(STORAGE_PATH);
      })
      .catch(err => {
        // Ignore EEXIST.
        if (!err || err.code !== 'EEXIST') {
          throw err;
        }
      })
      .then(() => {
        const directoryId = this.nextDirectoryId.toString();
        this.nextDirectoryId++;

        const directoryPath = path.join(STORAGE_PATH, directoryId);

        log.debug(`Creating '${directoryPath}'`);
        return fs.mkdir(directoryPath)
          .then(() => {
            return { directoryId, directoryPath };
          });
      })
      .then(result => {
        log.info(`Saving blob and metadata to '${result.directoryPath}'`);
        const blobPath = path.join(result.directoryPath, FILENAME_BLOB);
        const metaPath = path.join(result.directoryPath, FILENAME_METADATA);

        addHiddenProperties(metadata, reportInfo);

        return Promise.all([
          pipePromise(blob, createWriteStream(blobPath)),
          fs.writeFile(metaPath, JSON.stringify(metadata))
        ])
        .then(() => result);
      })
      .then(result => {
        this.directoryQueue.push(result.directoryId);
        this.chainToActivePromise(this.processNextDirectory.bind(this));
      });
  }

  send(reportType,
       blob,
       metadata,
       contentType = CONTENT_TYPE_UNKNOWN,
       contentLength = 0) {
    assert(this.running, 'Cannot send data after shutdown');
    assert(blob, 'No blob passed');
    assert(metadata, 'No metadata passed');
    assert(typeof metadata === 'object', 'metadata must be an object');
    assert(!(PROPERTY_URL in metadata),
           `metadata cannot contain a '${PROPERTY_URL}' property`);

    // Copy to make sure we don't modify the object that was passed in, and to
    // make sure that later changes to the object passed in don't race with upload
    // or saving to disk.
    metadata = Object.assign({ }, metadata);

    if (!(blob instanceof Readable)) {
      let buffer;
      if (blob instanceof Buffer) {
        buffer = blob;
      } else {
        let str;
        switch (typeof blob) {
          case 'object':
            str = JSON.stringify(blob);
            break;
          case 'string':
            str = blob;
            break;
          default:
            str = blob.toString();
        }
        buffer = new Buffer(str);
      }

      if (contentLength) {
        if (buffer.length !== contentLength) {
          throw new Error(`'contentLength' does not match blob length`);
        }
      } else {
        contentLength = buffer.length;
      }

      blob = new BufferReadable(buffer);
    }

    if (!contentLength) {
      throw new Error(`'contentLength' is 0`);
    }

    const reportInfo = {
      reportType,
      contentLength,
      contentType
    };

    log.info(`Queuing '${reportType}' blob and metadata`);

    let promiseFactory;
    if (this.wifiState === STATE_CONNECTED) {
      log.debug(`Connected, staging '${reportType}' for upload`);
      promiseFactory = () => {
        return this.waitForBackoffTimer()
          .then(() => this.upload(blob, metadata, reportInfo))
          .then(blobUrl => {
            if (!blobUrl) {
              return this.saveToDisk(blob, metadata, reportInfo);
            }
            return undefined;
          });
      };
    } else {
      log.debug(`Not connected, saving '${reportType}' to disk`);
      promiseFactory = () => this.saveToDisk(blob, metadata, reportInfo);
    }

    this.chainToActivePromise(promiseFactory);
    return this.activePromise;
  }

  socketConnectHandler() {
    if (this.backoffTimeoutInfo) {
      log.debug('Socket connected, skipping remaining timeout');

      this.nextTimeoutDelay = 0;
      this.backoffTimeoutInfo.skip();
    }
  }

  set hintSocket(val) {
    const eventName = 'connect';

    if (this._hintSocket) {
      this._hintSocket.off(eventName, this.socketConnectHandler.bind(this));
    }

    this._hintSocket = val;

    if (this._hintSocket) {
      this._hintSocket.on(eventName, this.socketConnectHandler.bind(this));
    }
  }

  get hintSocket() {
    return this._hintSocket;
  }

  shutdown() {
    if (!this.running) {
      return this.activePromise || Promise.resolve();
    }

    log.info('Shutting down');
    this.running = false;

    if (this.backoffTimeoutInfo) {
      this.backoffTimeoutInfo.cancel();
    }

    let promiseFactory = () => {
      return Promise.resolve()
        .then(() => {
          log.info('Shutdown complete');
        });
    };

    this.chainToActivePromise(promiseFactory);
    return this.activePromise;
  }

  sendCrash(...args) {
    return this.send(REPORT_TYPE_CRASH, ...args);
  }
}

export default function makeOutbox(wifi) {
  // Make an instance here but only expose certain properties and methods.
  let outbox = new Outbox(wifi);

  return {
    shutdown: outbox.shutdown.bind(outbox),
    sendCrash: outbox.sendCrash.bind(outbox),
    set hintSocket(val) {
      outbox.hintSocket = val;
    },
    get hintSocket() {
      return outbox.hintSocket;
    }
  };
}
