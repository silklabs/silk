/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * TODO: Please flow me
 */

/* eslint camelcase: "off" */

import invariant from 'assert';
import crypto from 'crypto';
import {EventEmitter} from 'events';
import fs from 'fs';
import request from 'request';
import silkCoreVersion from 'silk-core-version';
import silkBspVersion from 'silk-bsp-version';
import {spawn, spawnSync} from 'child_process';
import validator from 'validator';
import api from 'silk-device-api';
import * as UpdaterMetrics from './updater_metrics';

import createLog from 'silk-log/device';
import * as util from 'silk-sysutils';

const log = createLog('update');

const emitter = new EventEmitter();

const MANIFEST_URL_PROP = 'ro.silk.update.manifest_url';
const CHANNEL_PROP = 'persist.silk.update.channel';
const POLL_HOURS_PROP = 'ro.silk.update.poll_hours';
const PREVENT_REBOOT_PROP = 'persist.silk.update.noreboot';
const UPDATE_ENABLED_PROP = 'persist.silk.update.enabled';
const UPDATE_FILE_PATH = '/data/update.zip';

const SYSTEM_VERIFIED = util.getboolprop('partition.system.verified');
const BOARD = util.getprop('persist.silk.build.board',
                           util.getprop('ro.silk.build.board'));
const PRODUCT = util.getprop('ro.silk.build.product');
const VARIANT = util.getprop('ro.build.type');
const MANIFEST_URL_TEMPLATE = util.getprop(MANIFEST_URL_PROP);
const CHANNEL = util.getprop(CHANNEL_PROP, silkCoreVersion.branch);
const POLL_HOURS = util.getprop(POLL_HOURS_PROP);
const AB_UPDATE = util.getboolprop('ro.silk.update.ab', false);
const PREVENT_REBOOT = util.getboolprop(PREVENT_REBOOT_PROP);
const UPDATE_ENABLED = util.getboolprop(UPDATE_ENABLED_PROP, silkCoreVersion.official);

const isValidUpdateURLOptions = {
  protocols: ['http', 'https'],
  require_protocol: true,                       // eslint-disable-line camelcase
  require_tld: true,                            // eslint-disable-line camelcase
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
let downloadStartTimeMs;

let manifestURL = null;

// 'silk-core-version' loaded from the inactive system partition
// (or null if not available)
let inactiveSilkCoreVersion = null;

// 'silk-bsp-version' loaded from the inactive system partition
// (or null if not available)
let inactiveSilkBspVersion = null;

/**
 * Webpack works by replacing require with a specialized version which loads
 * from the bundle.  This is a trick to get the correct require from webpack
 */
const moduleRequire = ((() => {
  try {
    // $FlowFixMe
    return __non_webpack_require__;  //eslint-disable-line
  } catch (err) {
    return require;
  }
})());

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
      // DNS errors due to the device being offline show up here.  No big deal,
      // the retry mechanism will kick in
      log.warn(`request.get() error: ${err}`);
      reject();
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
          } catch (e) {
            log.error(`Invalid server response: ${e.stack}`);
            reject();
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

  const key = `${BOARD}-${PRODUCT}-${CHANNEL}-${VARIANT}`;
  let deviceMetadata = result.body[key]; // Unsanitized server response
  if (!deviceMetadata) {
    log.info(`Update server responded with nothing available for "${key}" ` +
             'device');
    return Promise.reject();
  }
  if (typeof deviceMetadata.info !== 'object') {
    log.warn('Update server responded with no info block');
    return Promise.reject();
  }
  if (typeof deviceMetadata.info.version !== 'string') {
    log.warn('Update server responded with no info.version');
    return Promise.reject();
  }

  function getBuildMetadata(deviceMetadata, buildType) {
    let buildMetadata = deviceMetadata[buildType];
    if (buildMetadata === null || typeof buildMetadata !== 'object') {
      return null;
    }

    // Validate URL.
    let url = buildMetadata.zip_url;
    if (!url) {
      log.warn('Update server responded with no url');
      return null;
    }

    if (!validator.isURL(url, isValidUpdateURLOptions)) {
      log.warn(`Update server responded with an invalid url: "${url}"`);
      return null;
    }

    // Validate size.
    if (!buildMetadata.zip_size) {
      log.warn('Update server responded with empty size download');
      return null;
    }

    let parsedSize = parseInt(buildMetadata.zip_size);
    if (isNaN(parsedSize)) {
      log.warn(`Update server responded with invalid size ${buildMetadata.size}`);
      return null;
    }

    buildMetadata.zip_size = parsedSize;

    // Validate sha1.
    if (!buildMetadata.zip_sha1) {
      log.warn('Update server responded with no sha1 hash');
      return null;
    }

    if (!validator.isHexadecimal(buildMetadata.zip_sha1)) {
      // Bail out.
      log.warn('Update server responded with an invalid sha1: ' +
               `"${buildMetadata.sha1}"`);
      return null;
    }

    buildMetadata.zip_sha1 = buildMetadata.zip_sha1.toLowerCase();
    return buildMetadata;
  }

  const currentSha = silkBspVersion.sha;
  if (currentSha === deviceMetadata.info.version) {
    log.info('Device is current');
    api.metrics.add(new UpdaterMetrics.UpdateCheck('current'));
    return Promise.reject();
  }

  let updateSha = null;
  if (AB_UPDATE) {
    if (inactiveSilkBspVersion) {
      updateSha = inactiveSilkBspVersion.sha;
    }
  } else {
    updateSha = currentSha;
  }

  currentMetadata = null;

  // Check for an incremental update
  if (updateSha !== null) {
    let buildMetadata = getBuildMetadata(deviceMetadata, updateSha);
    if (buildMetadata) {
      if (!SYSTEM_VERIFIED) {
        log.info('Skipping "inc" update as /system is unverified');
      } else {
        currentMetadata = buildMetadata;
        log.info('Selected incremental update');
        api.metrics.add(new UpdaterMetrics.UpdateCheck('inc'));
      }
    }
  }

  // Check for a full update
  if (currentMetadata === null) {
    let buildMetadata = getBuildMetadata(deviceMetadata, '*');
    if (buildMetadata) {
      currentMetadata = buildMetadata;
      log.info('Selected full update');
      api.metrics.add(new UpdaterMetrics.UpdateCheck('full'));
    }
  }


  if (!currentMetadata) {
    log.warn('No update available!');
    api.metrics.add(new UpdaterMetrics.UpdateCheck('none'));
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
  downloadStartTimeMs = util.uptime();

  // Download new update file.
  log.info(`Downloading "${currentMetadata.zip_url}" to "${UPDATE_FILE_PATH}"`);

  let { promise, cancel } =
    createPipeRequestPromise(currentMetadata.zip_url, UPDATE_FILE_PATH);
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

  const downloadTimeMs = util.uptime(downloadStartTimeMs);
  api.metrics.add(new UpdaterMetrics.ZipDownload(downloadTimeMs,
                                                 currentMetadata.zip_size));
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

  if (stats.size !== currentMetadata.zip_size) {
    // Bail out.
    log.warn(`Update size is incorrect, downloaded ${stats.size} bytes but ` +
             `expected ${currentMetadata.zip_size} bytes`);
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

  if (sha1 !== currentMetadata.zip_sha1) {
    // Bail out.
    log.warn(`Update sha1 is incorrect, got "${sha1}" but expected "` +
             `${currentMetadata.zip_sha1}"`);
    return Promise.reject();
  }

  log.info(`Update sha1 matches the expected hash: ${sha1}`);

  return Promise.resolve();
}

function stageUpdate() {
  if (AB_UPDATE) {
    return new Promise((resolve, reject) => {
      const stageStartUptime = util.uptime();
      const updater = spawn('silk-ab-updater', [UPDATE_FILE_PATH]);
      updater.stdout.on('data', (data) => {
        log.verbose('ab stdout:', data.toString());
      });

      updater.stderr.on('data', (data) => {
        log.warn('ab stderr:', data.toString());
      });

      updater.on('close', (code) => {
        log.info('updater exited with code', code);
        if (code === 0) {
          const stageTimeMs = util.uptime(stageStartUptime);
          emitter.emit('staged');
          running = false;
          api.metrics.add(new UpdaterMetrics.AbStageTime(stageTimeMs));
        } else {
          log.warn('Update failed to apply:', code);

          // Inactive partition is now in an unknown state, sync it with the
          // active partition to return to normality
          syncInactivePartition()
          .catch((err) => log.warn('syncInactivePartition failed:', err))
          .then(() => reject(new Error('Update failed')));
        }
      });
      updater.on('error', (err) => {
        log.warn('Error during update', err);
      });
    });
  }

  if (PREVENT_REBOOT) {
    log.info(`'${PREVENT_REBOOT_PROP}' is set, skipping staged event`);
    return Promise.resolve();
  }
  emitter.emit('staged');
  running = false;
  return Promise.resolve();
}

function cleanup(err) {
  if (err) {
    if (err.stack) {
      util.processthrow(err);
    }
    log.error(`Update poll error: ${err}`);
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
  manifestURL = manifestURL.replace('{board}', BOARD);
  manifestURL = manifestURL.replace('{product}', PRODUCT);
  manifestURL = manifestURL.replace('{variant}', VARIANT);
}

async function syncInactivePartition() {
  invariant(AB_UPDATE);
  invariant(SYSTEM_VERIFIED);

  log.verbose('Syncing inactive partition');
  await util.exec('silk-ab-updater', ['umount_system_ab']);
  await util.exec('silk-ab-updater', ['sync_inactive']);
}

async function loadInactiveSystemInfo() {
  if (!AB_UPDATE) {
    return;
  }
  if (!SYSTEM_VERIFIED) {
    log.verbose('/system not verified, refusing to read from inactive partition');
    return;
  }

  function requireNoCache(modName: string) {
    const modLocation = moduleRequire.resolve(modName);
    if (require.cache[modLocation]) {
      delete moduleRequire.cache[modLocation];
    }
    return moduleRequire(modLocation);
  }

  // Try loading the inactive partition twice.  If the first attempt fails, the
  // inactive partition is synced to the active partition
  for (let loadAttempt of [1, 2]) {
    log.debug('loadInactiveSystemInfo #', loadAttempt);
    try {
      await util.exec('silk-ab-updater', ['mount_system_ab']);

      inactiveSilkCoreVersion = requireNoCache('/mnt/system_ab/silk/node_modules/silk-core-version');
      inactiveSilkBspVersion = requireNoCache('/mnt/system_ab/node_modules/silk-bsp-version');

      log.verbose('Active silk-core-version', silkCoreVersion);
      log.verbose('Active silk-bsp-version', silkBspVersion);
      log.verbose('Inactive silk-core-version', inactiveSilkCoreVersion);
      log.verbose('Inactive silk-bsp-version', inactiveSilkBspVersion);

      invariant(inactiveSilkCoreVersion.branch === silkCoreVersion.branch,
        'branch mismatch between system partitions');
      invariant(inactiveSilkCoreVersion.bsp_api_id === inactiveSilkBspVersion.bsp_api_id,
        'inactive system partition bsp_api_id mismatch');

      await util.exec('silk-ab-updater', ['umount_system_ab']);
      return;
    } catch (err) {
      inactiveSilkBspVersion = null;
      inactiveSilkCoreVersion = null;
      log.warn('Unable to load inactive system info:', err);
    }

    // Something is amiss with the inactive partitions so
    // sync them back to a known state
    await syncInactivePartition();
  }
}

function start() {
  if (running) {
    return;
  }

  // Signal that the last update was successful enough to arrive here
  log.info('Marking boot successful');
  util.exec('bootctl', ['mark-boot-successful'])
  .then(result => {
    if (result.code !== 0) {
      log.warn('Failed to run bootctl: ', result);
    }
  });

  if (!MANIFEST_URL_TEMPLATE) {
    log.warn(`'${MANIFEST_URL_PROP}' is unset, disabling updates`);
    return;
  }

  _expandManifestUrlVars();

  if (!validator.isURL(manifestURL, isValidUpdateURLOptions)) {
    log.warn(`invalid url "${manifestURL}", disabling updates`);
    return;
  }

  if (!POLL_HOURS) {
    log.warn(`'${POLL_HOURS_PROP}' is unset, disabling updates`);
    return;
  }

  let pollHours = parseInt(POLL_HOURS);
  if (isNaN(pollHours) || pollHours <= 0) {
    log.warn(`'${POLL_HOURS_PROP}' is set to an invalid value ` +
               `"${POLL_HOURS}", disabling updates`);
    return;
  }

  if (!UPDATE_ENABLED) {
    log.warn(`'${UPDATE_ENABLED_PROP}' is unset, disabling updates`);
    return;
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

  loadInactiveSystemInfo()
  .then(() => {
    log.info(`Update polling started for "${manifestURL}"`);
    poll(/* runImmediately */ true);
  });

  return;
}

function stop(): Promise<void> {
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

function apply(): Promise<void> {
  if (AB_UPDATE) {
    util.setprop('sys.powerctl', 'reboot');
  } else {
    spawnSync('librecovery_test', ['installFotaUpdate', UPDATE_FILE_PATH]);
  }

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
