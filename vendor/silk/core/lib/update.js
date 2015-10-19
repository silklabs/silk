/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import crypto from 'crypto';
import fs from 'fs';
import * as util from './sysutils';
import createLog from './log';
import request from 'request';
import validator from 'validator';

import baseversion from './base_version';
import coreversion from 'core_version';

import { EventEmitter } from 'events';

const log = createLog('update');

let emitter = new EventEmitter();

const MANIFEST_URL_PROP = 'ro.silk.update.manifest_url';
const CHANNEL_PROP = 'persist.silk.update.channel';
const DEVICE_PROP = 'ro.boot.hardware';
const POLL_HOURS_PROP = 'ro.silk.update.poll_hours';
const PREVENT_REBOOT_PROP = 'persist.silk.update.noreboot';
const UPDATE_ENABLED_PROP = 'persist.silk.update.enabled';
const UPDATE_FILE_PATH = '/cache/update.zip';

const DEVICE = util.getprop(DEVICE_PROP);
const FINGERPRINT = util.getprop('ro.build.fingerprint');
const MANIFEST_URL_TEMPLATE = util.getprop(MANIFEST_URL_PROP);
const CHANNEL = util.getprop(CHANNEL_PROP);
const POLL_HOURS = util.getprop(POLL_HOURS_PROP);
const PREVENT_REBOOT = util.getboolprop(PREVENT_REBOOT_PROP);
const UPDATE_ENABLED = util.getboolprop(UPDATE_ENABLED_PROP);

const isValidUpdateURLOptions = {
  protocols: ['https'],
  require_protocol: true,                       // eslint-disable-line camelcase
  require_tld: true                             // eslint-disable-line camelcase
};

// Whether or not start has been called.
let running = false;

// The current promise chain.
let pollPromise = null;

// A function that can cancel the current promise chain.
let cancelFunction = null;

// Metadata that has been downloaded during the current promise chain.
let currentMetadata = null;

// Whether or not a zip file download has been attempted during the current
// promise chain.
let startedDownload = false;

let manifestURL = null;

// Resolves with:
//   null: when the timeout elapses.
//
// Rejects with:
//   null: if the timeout is canceled.
function createTimeoutPromise(delay) {
  let cancel;
  let promise = new Promise((resolve, reject) => {
    let timeout = setTimeout(resolve, delay);
    cancel = () => {
      log.info('Canceling during a timeout');
      reject();
      clearTimeout(timeout);
    };
  });
  return { promise: promise, cancel: cancel };
}

// Resolves with:
//   { response, body }: after the request has completed.
//
// Rejects with:
//   null: if the request is canceled.
//   Error: if an error is emitted.
function createRequestPromise(options) {
  options = options || { };
  let cancel;
  let promise = new Promise((resolve, reject) => {
    let req = request.get(options);
    req.on('error', (err) => {
      reject(err);
      req.abort();
    })
    .on('response', (response) => {
      if (response.statusCode !== 200) {
        resolve({ response: response, body: null });
        return;
      }
      let body = '';
      response.on('data', (chunk) => {
        body += chunk;
      })
      .on('end', () => {
        if (options.json) {
          try {
            body = JSON.parse(body);
          } catch(e) {
            reject(`Invalid server response: ${e.stack}`);
            return;
          }
        }
        resolve({ response, body });
      });
    });

    cancel = () => {
      log.info('Canceling during a requestPromise');
      reject();
      req.abort();
    };
  });
  return { promise: promise, cancel: cancel };
}

// Resolves with:
//   null: after the request has completed and the file has been streamed to
//         disk.
//   response: if the server responsed with a non-200 code.
//
// Rejects with:
//   null: if the request is canceled.
//   Error: if an error is emitted.
function createPipeRequestPromise(options, path) {
  let cancel;
  let promise = new Promise((resolve, reject) => {
    let req = request.get(options);
    let pipe = req.pipe(fs.createWriteStream(path));

    // Some internet sources say that we should call pipe.end() as well as
    // calling req.abort() here.
    let finish = () => {
      req.abort();
      pipe.end();
    };

    req.on('error', (err) => {
      reject(err);
      finish();
    })
    .on('response', (response) => {
      if (response.statusCode !== 200) {
        resolve(response);
        finish();
      }
    });

    pipe.on('error', (err) => {
      reject(err);
      finish();
    })
    .on('finish', () => {
      resolve();
    });

    cancel = () => {
      log.info('Canceling during a pipeRequestPromise');
      reject();
      finish();
    };
  });
  return { promise: promise, cancel: cancel };
}

// Resolves with:
//   fs.Stats: after stat() has been called.
//
// Rejects with:
//   Error: if an error is emitted.
function createStatPromise(path) {
  let cancel = () => {
    // There is no way to really cancel this.
    log.info('Canceling during a statPromise');
  };
  let promise = new Promise((resolve, reject) => {
    fs.stat(path, (err, stats) => {
      if (err ) {
        reject(err);
      } else {
        resolve(stats);
      }
    });
  });
  return { promise: promise, cancel: cancel };
}

// Resolves with:
//   true: if the file was removed.
//   false: if the file did not exist and was not removed.
//
// Rejects with:
//   Error: if an error is emitted.
function createUnlinkPromise(path) {
  // No way to cancel this.
  let cancel = () => {
    // There is no way to really cancel this.
    log.info('Canceling during a unlinkPromise');
  };
  let promise = new Promise((resolve, reject) => {
    fs.unlink(path, (err) => {
      // Ignore ENOENT, it just means that the file didn't exist.
      if (err && err.code !== 'ENOENT') {
        reject(err);
      } else {
        resolve(err ? false : true);
      }
    });
  });
  return { promise: promise, cancel: cancel };
}

// Resolves with:
//   sha1 digest
//
// Rejects with:
//   null: if the sha1 is canceled.
//   Error: if an error is emitted.
function createSHA1Promise(path) {
  let cancel;
  let promise = new Promise((resolve, reject) => {
    let canceled = false;
    let shasum = crypto.createHash('sha1');
    let stream = fs.createReadStream(path);
    stream.on('error', (err) => {
      reject(err);
    })
    .on('readable', () => {
      if (canceled) {
        return;
      }
      let chunk;
      while (null !== (chunk = stream.read())) {
        shasum.update(chunk);
      }
    })
    .on('end', () => {
      resolve(shasum.digest('hex').toLowerCase());
    });

    cancel = () => {
      log.info('Canceling during a sha1Promise');
      reject();
      canceled = true;
    };
  });
  return { promise: promise, cancel: cancel };
}

function waitForPollTime(runImmediately) {
  // Maybe bail out.
  if (!running) {
    return Promise.reject();
  }

  if (runImmediately) {
    return Promise.resolve();
  }

  log.info(`Scheduling update poll in ${POLL_HOURS} hours`);

  // Set a timer to run the update check.
  let pollMs = parseInt(POLL_HOURS) * 60 * 60 * 1000;

  let { promise, cancel } = createTimeoutPromise(pollMs);
  cancelFunction = cancel;
  return promise;
}

function fetchManifest() {
  // Maybe bail out.
  if (!running) {
    return Promise.reject();
  }

  // Fetch the fingerprint from the OTA server.
  log.info(`Checking "${manifestURL}" for updates`);

  let { promise, cancel } = createRequestPromise({ uri: manifestURL,
                                                   json: true });
  cancelFunction = cancel;
  return promise;
}

function validateManifest(result) {
  // Maybe bail out.
  if (!running) {
    return Promise.reject();
  }

  let status = result.response.statusCode;
  if (status !== 200) {
    // Bail out.
    log.info(`Update server responded with status ${status}`);
    return Promise.reject();
  }

  let deviceMetadata = result.body[DEVICE]; // Unsanitized server response
  if (!deviceMetadata) {
    log.info(`Update server responded with nothing available for "${DEVICE}" ` +
             'device');
    return Promise.reject();
  }

  function getBuildMetadata(deviceMetadata, buildType) {
    let buildMetadata = deviceMetadata[buildType];
    if (buildMetadata === null || typeof(buildMetadata) !== 'object') {
      return null;
    }

    switch (buildType) {
    case 'silk':
      if (!buildMetadata.base_version) {
        log.warn('Update server responded with no base_version');
        return null;
      }
      if (!buildMetadata.core_version) {
        log.warn('Update server responded with no core_version');
        return null;
      }
      break;
    case 'full':
      // Validate the fingerprint.
      let fingerprint = buildMetadata.fingerprint;
      if (!fingerprint) {
        log.warn('Update server responded with no fingerprint');
        return null;
      }
      break;
    default:
      throw new Error(`Unknown buildType: ${buildType}`);
    }

    // Validate URL.
    let url = buildMetadata.url;
    if (!url) {
      log.warn('Update server responded with no url');
      return null;
    }

    if (!validator.isURL(url, isValidUpdateURLOptions)) {
      log.warn(`Update server responded with an invalid url: "${url}"`);
      return null;
    }

    // Validate size.
    if (!buildMetadata.size) {
      log.warn('Update server responded with empty size download');
      return null;
    }

    let parsedSize = parseInt(buildMetadata.size);
    if (isNaN(parsedSize)) {
      log.warn(`Update server responded with invalid size ${buildMetadata.size}`);
      return null;
    }

    buildMetadata.size = parsedSize;

    // Validate sha1.
    if (!buildMetadata.sha1) {
      log.warn('Update server responded with no sha1 hash');
      return null;
    }

    if (!validator.isHexadecimal(buildMetadata.sha1)) {
      // Bail out.
      log.warn('Update server responded with an invalid sha1: ' +
               `"${buildMetadata.sha1}"`);
      return null;
    }

    buildMetadata.sha1 = buildMetadata.sha1.toLowerCase();
    return buildMetadata;
  }

  // Select an update from options provided by the server.  Prefer the smaller
  // 'silk' update which only affects /system/silk and falling back to a 'full'
  // update of the entire device software.
  currentMetadata = null;
  ['silk', 'full'].forEach(buildType => {
    if (currentMetadata) {
      return; // Already found a build
    }

    let buildMetadata = getBuildMetadata(deviceMetadata, buildType);
    if (!buildMetadata) {
      return;
    }

    const FORCE_UPDATE = false; // true can be helpful debugging
    switch (buildType) {
    case 'silk':
      // Ensure the base gonk is compatible before accepting a partial /system
      // update.
      if (buildMetadata.base_version === baseversion) {
        if (buildMetadata.core_version !== coreversion || FORCE_UPDATE) {
          // Different fingerprint, select this build
          currentMetadata = buildMetadata;
          log.info('Selected "silk" update');
        } else {
          log.verbose('Already running the latest "silk" update');
        }
      } else {
        log.verbose('base version mismatch for "silk" update');
      }
      break;
    case 'full':
      if (buildMetadata.fingerprint !== FINGERPRINT || FORCE_UPDATE) {
        // Different fingerprint, select this build
        currentMetadata = buildMetadata;
        log.info('Selected "full" update');
      } else {
        log.verbose('Already running the latest "full" update');
      }
      break;
    default:
      throw new Error(`Unknown buildType: ${buildType}`);
    }
  });

  if (!currentMetadata) {
    log.info('No update available');
    return Promise.reject();
  }
  return Promise.resolve();
}

function removeOldUpdate() {
  // Maybe bail out.
  if (!running) {
    return Promise.reject();
  }

  // Remove old update file.
  log.info(`Removing "${UPDATE_FILE_PATH}" if it exists`);

  let { promise, cancel } = createUnlinkPromise(UPDATE_FILE_PATH);
  cancelFunction = cancel;
  return promise;
}

function fetchUpdate(/* removed */) {
  // Maybe bail out.
  if (!running) {
    return Promise.reject();
  }

  startedDownload = true;

  // Download new update file.
  log.info(`Downloading "${currentMetadata.url}" to "${UPDATE_FILE_PATH}"`);

  let { promise, cancel } =
    createPipeRequestPromise(currentMetadata.url, UPDATE_FILE_PATH);
  cancelFunction = cancel;
  return promise;
}

function determineUpdateSize(response) {
  // Maybe bail out.
  if (!running) {
    return Promise.reject();
  }

  if (response) {
    // Bail out.
    log.info('Update server responded with status ' + response.statusCode);
    return Promise.reject();
  }

  log.info('Update download completed');

  let { promise, cancel } = createStatPromise(UPDATE_FILE_PATH);
  cancelFunction = cancel;
  return promise;
}

function validateUpdateSize(stats) {
  // Maybe bail out.
  if (!running) {
    return Promise.reject();
  }

  if (stats.size !== currentMetadata.size) {
    // Bail out.
    log.warn(`Update size is incorrect, downloaded ${stats.size} bytes but ` +
             `expected ${currentMetadata.size} bytes`);
    return Promise.reject();
  }

  return Promise.resolve();
}

function calculateUpdateHash() {
  // Maybe bail out.
  if (!running) {
    return Promise.reject();
  }

  log.info('Computing SHA1 for the file');

  let { promise, cancel } = createSHA1Promise(UPDATE_FILE_PATH);
  cancelFunction = cancel;
  return promise;
}

function validateUpdateHash(sha1) {
  // Maybe bail out.
  if (!running) {
    return Promise.reject();
  }

  if (sha1 !== currentMetadata.sha1) {
    // Bail out.
    log.warn(`Update sha1 is incorrect, got "${sha1}" but expected "` +
             `${currentMetadata.sha1}"`);
    return Promise.reject();
  }

  log.info(`Update sha1 matches the expected hash: ${sha1}`);

  return Promise.resolve();
}

function stageUpdate() {
  if (PREVENT_REBOOT) {
    log.info(`'${PREVENT_REBOOT_PROP}' is set, skipping staged event`);
    return Promise.resolve();
  }

  // TODO: Make sure nothing else is writing to disk before we call this
  //       because we want our file cache buffers sync'd properly.
  log.info(`'${PREVENT_REBOOT_PROP}' is not set, staging update`);

  emitter.emit('staged');
  return Promise.resolve();
}

function cleanup(err) {
  if (err) {
    if (err.stack) {
      util.processthrow(err);
    }
    log.warn(`Update poll error: ${err}`);
  }

  if (startedDownload) {
    log.info(`Removing "${UPDATE_FILE_PATH}" if it exists`);

    // We don't want this to be canceled.
    cancelFunction = null;
    return createUnlinkPromise(UPDATE_FILE_PATH).promise;
  }

  return Promise.resolve();
}

function restart() {
  // Get the update timer running again.
  cancelFunction = null;
  pollPromise = null;
  currentMetadata = null;
  startedDownload = false;

  if (running) {
    poll(/* runImmediately */ false);
  }
}

function poll(runImmediately) {
  // Glue everything together into one long promise chain.
  waitForPollTime(runImmediately)
  .then(fetchManifest)
  .then(validateManifest)
  .then(removeOldUpdate)
  .then(fetchUpdate)
  .then(determineUpdateSize)
  .then(validateUpdateSize)
  .then(calculateUpdateHash)
  .then(validateUpdateHash)
  .then(stageUpdate)
  .catch(cleanup)
  .then(restart);
}

function _expandManifestUrlVars() {
  manifestURL = MANIFEST_URL_TEMPLATE.replace('{channel}', CHANNEL);
  manifestURL = manifestURL.replace('{device}', DEVICE);
}

function start() {
  if (running) {
    return Promise.resolve();
  }

  if (!MANIFEST_URL_TEMPLATE) {
    log.warn(`'${MANIFEST_URL_PROP}' is unset, disabling updates`);
    return Promise.resolve();
  }

  _expandManifestUrlVars();

  if (!validator.isURL(manifestURL, isValidUpdateURLOptions)) {
    log.warn(`invalid url "${manifestURL}", disabling updates`);
    return Promise.resolve();
  }

  if (!POLL_HOURS) {
    log.warn(`'${POLL_HOURS_PROP}' is unset, disabling updates`);
    return Promise.resolve();
  }

  let pollHours = parseInt(POLL_HOURS);
  if (isNaN(pollHours) || pollHours <= 0) {
    log.warn(`'${POLL_HOURS_PROP}' is set to an invalid value ` +
               `"${POLL_HOURS}", disabling updates`);
    return Promise.resolve();
  }

  if (!UPDATE_ENABLED) {
    log.warn(`'${UPDATE_ENABLED_PROP}' is unset, disabling updates`);
    return Promise.resolve();
  }

  running = true;

  // TODO: Check the status of the last update and report anything fishy.

  // Remove any old update files left over from a previous update.
  createUnlinkPromise(UPDATE_FILE_PATH).promise.then(removed => {
    if (removed) {
      log.info(`Removed old "${UPDATE_FILE_PATH}" file`);
    }
  })
  .catch(err => {
    log.warn(`Failed to remove "${UPDATE_FILE_PATH}": ${err}`);
  });

  log.info(`Update polling started for "${manifestURL}", fingerprint: "` +
           `${FINGERPRINT}"`);
  poll(/* runImmediately */ true);

  return Promise.resolve();
}

function stop() {
  if (!running) {
    return Promise.resolve();
  }

  // Don't let additional async actions start.
  running = false;

  // Try to cancel any async action that is currently in progress.
  if (cancelFunction) {
    cancelFunction();
    cancelFunction = null;
  }

  // Return a promise that will be resolved once all the update machinery has
  // completed.
  let promise = pollPromise || Promise.resolve();
  pollPromise = null;

  function done() {
    log.info('Update polling stopped');
  }

  return promise.then(done, done);
}

function apply() {
  let spawnSync = require('child_process').spawnSync;
  spawnSync('librecovery_test', ['installFotaUpdate', UPDATE_FILE_PATH]);

  // This is paranoid, but if spawnSync() returns before we reboot then we don't
  // want to attempt normal cleanup to remove the zip file. Setting these flags
  // and then calling stop() should prevent normal cleanup and bail out of our
  // poll loop.
  cancelFunction = null;
  startedDownload = false;

  let promise = stop();
  promise.then(Promise.reject);
  return promise;
}

emitter.start = start;
emitter.stop = stop;
emitter.apply = apply;
module.exports = emitter;
