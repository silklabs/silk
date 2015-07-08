/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let crypto = require('crypto');
let fs = require('fs');
let getprop = require('./util').getprop;
let request = require('request');
let ui = require('./ui');
let validator = require('validator');

const MANIFEST_URL_PROP = 'ro.silk.update.manifest_url';
const POLL_HOURS_PROP = 'ro.silk.update.poll_hours';
const PREVENT_REBOOT_PROP = 'persist.silk.update.noreboot';
const UPDATE_FILE_PATH = '/cache/update.zip';

const DEVICE = getprop('ro.boot.hardware');
const FINGERPRINT = getprop('ro.build.fingerprint');
const MANIFEST_URL = getprop(MANIFEST_URL_PROP);
const POLL_HOURS = getprop(POLL_HOURS_PROP);
const PREVENT_REBOOT = getprop(PREVENT_REBOOT_PROP) !== '';

// TODO: Set this to false for engineering builds somehow.
const IGNORE_SAME_FINGERPRINT = true;

const isValidUpdateURLOptions = {
  protocols: ['https'],
  require_protocol: true,                       // eslint-disable-line camelcase
  require_tld: true                             // eslint-disable-line camelcase
};

function log(str) {
  console.log(`*** update.js *** ${str}`);
}

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
      log('Canceling during a timeout');
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
            reject(e);
            return;
          }
        }
        resolve({ response: response, body: body });
      });
    });

    cancel = () => {
      log('Canceling during a requestPromise');
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
      log('Canceling during a pipeRequestPromise');
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
    log('Canceling during a statPromise');
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
    log('Canceling during a unlinkPromise');
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
      log('Canceling during a sha1Promise');
      reject();
      canceled = true;
    };
  });
  return { promise: promise, cancel: cancel };
}

function waitForPollTime() {
  // Maybe bail out.
  if (!running) {
    return Promise.reject();
  }

  log(`Scheduling update poll in ${POLL_HOURS} hours`);

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
  log(`Checking "${MANIFEST_URL}" for updates`);

  let { promise, cancel } = createRequestPromise({ uri: MANIFEST_URL,
                                                   json: true });
  cancelFunction = cancel;
  return promise;
}

function validateManifest(result) {
  // Maybe bail out.
  if (!running) {
    return Promise.reject();
  }

  // Examine the fingerprint to see if we need to update.
  let status = result.response.statusCode;
  if (status !== 200) {
    // Bail out.
    log(`Update server responded with status ${status}`);
    return Promise.reject();
  }

  let metadata = result.body[DEVICE];
  if (!metadata) {
    log(`Update server responded with nothing available for "${DEVICE}" ` +
        'device');
    return Promise.reject();
  }

  // Validate the fingerprint.
  let fingerprint = metadata.fingerprint;
  if (!fingerprint) {
    // Bail out.
    log('Update server responded with no fingerprint');
    return Promise.reject();
  }

  if (IGNORE_SAME_FINGERPRINT && fingerprint === FINGERPRINT) {
    // Bail out.
    log('No update available');
    return Promise.reject();
  }

  log(`Update server responded with fingerprint "${fingerprint}"`);

  // Validate URL.
  let url = metadata.url;
  if (!url) {
    // Bail out.
    log('Update server responded with no url');
    return Promise.reject();
  }

  if (!validator.isURL(url, isValidUpdateURLOptions)) {
    // Bail out.
    log(`Update server responded with an invalid url: "${url}"`);
    return Promise.reject();
  }

  // Validate size.
  if (!metadata.size) {
    // Bail out.
    log('Update server responded with empty size download');
    return Promise.reject();
  }

  let parsedSize = parseInt(metadata.size);
  if (isNaN(parsedSize)) {
    // Bail out.
    log(`Update server responded with invalid size ${metadata.size}`);
    return Promise.reject();
  }

  metadata.size = parsedSize;

  // Validate sha1.
  if (!metadata.sha1) {
    // Bail out.
    log('Update server responded with no sha1 hash');
    return Promise.reject();
  }

  if (!validator.isHexadecimal(metadata.sha1)) {
    // Bail out.
    log(`Update server responded with an invalid sha1: "${metadata.sha1}"`);
    return Promise.reject();
  }

  metadata.sha1 = metadata.sha1.toLowerCase();

  // Save this for later promises.
  currentMetadata = metadata;

  return Promise.resolve();
}

function removeOldUpdate() {
  // Maybe bail out.
  if (!running) {
    return Promise.reject();
  }

  // Remove old update file.
  log(`Removing "${UPDATE_FILE_PATH}" if it exists`);

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
  log(`Downloading "${currentMetadata.url}" to "${UPDATE_FILE_PATH}"`);

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
    log('Update server responded with status ' + response.statusCode);
    return Promise.reject();
  }

  log('Update download completed');

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
    log(`Update size is incorrect, downloaded ${stats.size} bytes but ` +
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

  log('Computing SHA1 for the file');

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
    log(`Update sha1 is incorrect, got "${sha1}" but expected "` +
        `${currentMetadata.sha1}"`);
    return Promise.reject();
  }

  log(`Update sha1 matches the expected hash: ${sha1}`);

  return Promise.resolve();
}

function stageUpdateAndReboot() {
  if (PREVENT_REBOOT) {
    log(`'${PREVENT_REBOOT_PROP}' is set, skipping reboot`);
    return Promise.resolve();
  }

  // TODO: Make sure nothing else is writing to disk before we call this
  //       because we want our file cache buffers sync'd properly.
  log(`'${PREVENT_REBOOT_PROP}' is not set, rebooting`);

  ui('powerdown');

  let spawnSync = require('child_process').spawnSync;
  spawnSync('librecovery_test', ['installFotaUpdate', UPDATE_FILE_PATH]);

  // This is paranoid, but if spawnSync() returns before we reboot then we don't
  // want to attempt normal cleanup to remove the zip file. Setting these flags
  // and then calling stop() should prevent normal cleanup and bail out of our
  // poll loop.
  cancelFunction = null;
  startedDownload = false;

  let promise = stop();              // eslint-disable-line no-use-before-define
  promise.then(Promise.reject);
  return promise;
}

function cleanup(err) {
  if (err) {
    log(`Update poll error: ${err}`);
  }

  if (startedDownload) {
    log(`Removing "${UPDATE_FILE_PATH}" if it exists`);

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
    poll();
  }
}

function poll() {
  // Glue everything together into one long promise chain.
  waitForPollTime()
  .then(fetchManifest)
  .then(validateManifest)
  .then(removeOldUpdate)
  .then(fetchUpdate)
  .then(determineUpdateSize)
  .then(validateUpdateSize)
  .then(calculateUpdateHash)
  .then(validateUpdateHash)
  .then(stageUpdateAndReboot)
  .catch(cleanup)
  .then(restart);
}

function start() {
  if (running) {
    return Promise.resolve();
  }

  if (!MANIFEST_URL) {
    log(`'${MANIFEST_URL_PROP}' is unset, disabling updates`);
    return Promise.resolve();
  }

  if (!validator.isURL(MANIFEST_URL, isValidUpdateURLOptions)) {
    log(`'${MANIFEST_URL_PROP}' is set to an invalid url "${MANIFEST_URL}",` +
        ' disabling updates');
    return Promise.resolve();
  }

  if (!POLL_HOURS) {
    log(`'${POLL_HOURS_PROP}' is unset, disabling updates`);
    return Promise.resolve();
  }

  let pollHours = parseInt(POLL_HOURS);
  if (isNaN(pollHours) || pollHours <= 0) {
    log(`'${POLL_HOURS_PROP}' is set to an invalid value "${POLL_HOURS}", ` +
        'disabling updates');
    return Promise.resolve();
  }

  running = true;

  // TODO: Check the status of the last update and report anything fishy.

  // Remove any old update files left over from a previous update.
  createUnlinkPromise(UPDATE_FILE_PATH).promise.then(removed => {
    if (removed) {
      log(`Removed old "${UPDATE_FILE_PATH}" file`);
    }
  })
  .catch(err => {
    log(`Failed to remove "${UPDATE_FILE_PATH}": ${err}`);
  });

  log(`Update polling started for "${MANIFEST_URL}", fingerprint: "` +
      `${FINGERPRINT}"`);
  poll();

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
    log('Update polling stopped');
  }

  return promise.then(done, done);
}

module.exports = {
  start: start,
  stop: stop
};
