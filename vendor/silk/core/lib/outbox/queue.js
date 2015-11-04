/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/*eslint no-loop-func:0*/

import assert from 'assert';
import fs from 'mz/fs';
import path from 'path';
import createLog from '../log';

import { EventEmitter } from 'events';
import Operation from './operation';

const log = createLog('outbox:queue');

const MAX_BACKOFF_MS = (1000 * 60) * 60; // 1 hour

// After this many retries, give up and DELETE the operation
//   “Insanity: doing the same thing over and over again
//    and expecting different results."
const MAX_RETRIES = 128;

async function wrapNoEntity(promise, value = null) {
  try {
    return await promise;
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return value;
    }
    throw err;
  }
}

/**
 * Manages the queuing functionality for the Outbox.
 *
 * The queue is given various operations and then is responsible for scheduling
 * them including operations which may have been saved to disk previously.
 */
export default class Queue extends EventEmitter {

  // Only used in logging...
  name = 'default-queue';

  /**
   * Location where we persist data on disk.
   */
  storagePath = null;
  operations = {};

  /**
   * An array of promises holding all running "live" operations only used to
   * facilitate clean shutdowns.
   */
  liveOperations = [];

  // Promise when loading disk queue...
  _pendingDiskQueueLoad = null;

  /**
   * An array of directory names which are pending upload once the queue is
   * online.
   */
  diskQueue = [];
  diskQueueState = new Map();

  // setTimeout handle:
  diskCheckHandle = null;
  // Used to indicate if we should check for more work:
  diskCheckRunning = false;

  // How long to wait between checks to do more operations (in ms)
  backoffInterval = 0;
  // Maximum number of allowed concurrent operations in the queue.
  concurrency = 2;
  // Number of running operations in the queue (should always be < than
  // concurrency)
  running = 0;

  /**
   * When online the queue will attempt to write operations to their
   * destination. When false everything is immediately stored to disk.
   */
  online = true;

  /**
   * Expected to be invoked by Outbox will return the list of pending items in a
   * directory sorted numerically.
   */
  static async searchDirectory(storagePath) {
    let paths = await wrapNoEntity(fs.readdir(storagePath), []);
    // Collect all the paths which look sorta like what we would expect.
    paths = paths.reduce((result, value) => {
      let asInt = parseInt(value, 10);
      if (!isNaN(asInt)) {
        result.push(value);
        return result;
      }
      log.warn(
        `Invalid (NaN) queue directory: ${path.join(storagePath, value)}`
      );
      return result;
    }, []);

    // Sort numerically.
    paths.sort((a, b) => a - b);

    let stats = await Promise.all(paths.map(async (directoryPath) => {
      let absPath = path.join(storagePath, directoryPath);
      return fs.stat(absPath);
    }));

    return stats.reduce((result, value, idx) => {
      // Skip over anything that is not a directory it is certainly not what we
      // are looking for.
      if (!value.isDirectory()) {
        let absPath = path.join(storagePath, paths[idx]);
        log.warn(`Skipping over path which is not a directory: ${absPath}`);
        return result;
      }
      result.push(parseInt(paths[idx], 10));
      return result;
    }, []);
  }

  constructor(options) {
    super();
    Object.assign(this, options);

    assert.ok(this.concurrency && this.concurrency > 0);
    assert.ok(this.storagePath);

    /**
     * It's very important we start outbox synchronously so we can immediately
     * begin queuing items (like in the case of crash on startup) so we load
     * pending items asynchronously.
     */
    this._pendingDiskQueueLoad = this._loadDiskQueue().then(() => {
      this._pendingDiskQueueLoad = null;
    }).catch((err) => {
      log.error(`Error when loading disk queue ${err.stack}`);
    });
  }

  async _loadDiskQueue() {
    this.diskQueue = await Queue.searchDirectory(this.storagePath);
    for (let diskQueueId of this.diskQueue) {
      this.diskQueueState.set(diskQueueId, {
        id: diskQueueId,
        path: path.join(this.storagePath, String(diskQueueId))
      });
    }
  }

  add(operation, readable) {
    // Do not process add operations until disk queue has been loaded...
    if (this._pendingDiskQueueLoad) {
      return this._pendingDiskQueueLoad.then(() => {
        return this.add(operation, readable);
      });
    }

    this.running += 1;

    let cleanup = promise => {
      let idx = this.liveOperations.indexOf(promise);
      this.liveOperations.splice(idx, 1);
      this.running -= 1;
    };

    // Easier to implement this with raw promise functionality as we can
    // reference our own promise chain here...
    let liveOperation = this._add(operation, readable)
      .then((value) => {
        cleanup(liveOperation);
        return value;
      })
      .catch((err) => {
        cleanup(liveOperation);
        throw err;
      });

    this.liveOperations.push(liveOperation);

    return liveOperation;
  }

  async _add(operation, readable) {
    if (!this.operations[operation.constructor.NAME]) {
      throw new Error(`
        Use of unknown operation ${operation.constructor.NAME} register it first!
      `);
    }

    let saveToDisk = false;
    if (!this.online) {
      log.info('Operation while offline, saving to disk');
      saveToDisk = true;
    } else if (this.running >= this.concurrency) {
      log.info('Too many concurrent operations, saving to disk');
      saveToDisk = true;
    }

    if (saveToDisk) {
      await this._appendToDisk(operation, readable);
      return;
    }

    let start = Date.now();
    let result = await operation.write(readable);
    if (result.done) {
      this.emit('finished operation', operation);
      log.info(
        `Successfully ran operation on ${this.name}`,
        operation.constructor.name,
        `took ${Date.now() - start} ms`
      );
      return;
    }

    this.emit('failed operation', operation);
    log.warn(`Error while running operation, saving to disk:`, result.error);
    await this._appendToDisk(operation, result.remainder);
  }

  async _appendToDisk(operation, readable) {
    let handle = this.createDiskQueueId();
    // Mark the handle as running to ensure we do not race against ourselves
    // when writing out the files to disk!
    handle.running = true;

    log.verbose(
      `Saving operation to disk (${handle.path})`,
      operation.getMetadata()
    );

    try {
      await operation.saveToDisk(readable, handle.path);
      this.emit('saved operation', handle);
    } catch (err) {
      log.error(`
        Failed to save operation to disk (${handle.path}):

        ${err.stack}
      `);
      await operation.constructor.removeFromDisk(handle.path);
      try {
        this.removeFromDiskQueue(handle.id);
      } catch(errRemoveDisk) {
        log.error(`
          Unexpected error removing files from disk

          ${errRemoveDisk.stack}
        `);
      }
    }
    handle.running = false;
  }

  /**
   * Create and register an identifier to the disk queue.
   *
   * This will ensure that this id is checked when searching for pending
   * operations.
   */
  createDiskQueueId() {
    let lastId = this.diskQueue[this.diskQueue.length - 1];
    if (!lastId) {
      lastId = 0;
    }
    assert(typeof lastId === 'number');
    let id = lastId + 1;
    this.diskQueue.push(id);
    let handle = {
      id,
      path: path.join(this.storagePath, String(id))
    };

    this.diskQueueState.set(id, handle);
    return handle;
  }

  removeFromDiskQueue(id) {
    let idx = this.diskQueue.indexOf(id);
    let handle = this.diskQueueState.get(id);
    if (idx !== -1) {
      this.diskQueue.splice(idx, 1);
      this.diskQueueState.delete(id);
      this.emit('removed operation', handle);
    }
  }

  start(interval) {
    if (this.diskCheckRunning) {
      return;
    }

    this.backoffInterval = interval;
    this.diskCheckRunning = true;

    /**
     * This could potentially be more efficient by polling less or being
     * completely event oriented (somehow) but polling here is very reliable and
     * fairly cheap/easy.
     */
    log.info(`Starting polling of pending operations...`);
    this.workDiskQueue();
  }

  workDiskQueue() {
    let now = Date.now();
    for (let id of this.diskQueue) {
      let handle = this.diskQueueState.get(id);

      // Skip over anything that is currently running...
      if (handle.running) {
        continue;
      }

      // Skip over anything that is not ready to be retried...
      if (handle.delay && handle.delay > now) {
        log.debug(
          `${handle.path} will be retried in`,
          handle.delay - now
        );
        continue;
      }

      if (this.running >= this.concurrency) {
        log.info(`Reached maximum number of running operations max:` +
          `${this.concurrency} running: ${this.running} ` +
          `diskqueue: ${this.diskQueue.length}`
        );
        break;
      }

      this.running += 1;
      handle.running = true;
      handle.promise = async () => {
        try {
          await this._workDiskQueueItem(handle);
        } catch(err) {
          log.error('Error working queue', err.stack);
        }
        handle.running = false;
        this.running -= 1;
      }();
    }

    if (this.diskCheckRunning) {
      this.diskCheckHandle = setTimeout(
        () => this.workDiskQueue(),
        this.backoffInterval
      );
    }
  }

  resetBackOff() {
    for (let handle in this.diskQueueState) {
      delete handle.delay;
    }
    log.info(`Reset backoff delay for ${this.diskQueue.length} operations`);
  }

  stop() {
    clearInterval(this.diskCheckHandle);
    this.diskCheckRunning = false;
    this.diskCheckHandle = null;
    log.info(`Stopped checking for pending operations...`, {
      online: this.online
    });
  }

  /**
   * Attempt to gracefully shutdown the queue will return a promise which will
   * resolve when all outstanding work is complete (immediately stops polling
   * for pending operations).
   */
  async shutdown() {
    log.info(`Shutting down`, {
      running: this.running
    });

    this.stop();

    let pending = [];
    for (let id of this.diskQueue) {
      let handle = this.diskQueueState.get(id);
      if (handle.promise) {
        pending.push(handle.promise);
      }
    }

    pending = pending.concat(this.liveOperations);
    if (pending.length !== this.running) {
      log.error(`
        Clean shutdown impossible:
          Known Pending: ${pending.length}
          Running: ${this.running}
      `);
    }
    await Promise.all(pending);
  }

  async _workDiskQueueItem(handle) {
    let metadataPath = path.join(handle.path, Operation.METATADATA_NAME);
    let blobPath = path.join(handle.path, Operation.BLOB_NAME);

    if (!await fs.exists(metadataPath)) {
      log.warn(`
        Metadata is missing from: ${handle.path}
        Cleaning up operation directory...
      `);
      await Operation.removeFromDisk(handle.path);
      this.removeFromDiskQueue(handle.id);
      return;
    }

    let metadata = await fs.readFile(metadataPath, 'utf8');
    try {
      metadata = JSON.parse(metadata);
    } catch (err) {
      log.error(`Invalid metadata in operation... Purging operation directory`);
      await Operation.removeFromDisk(handle.path);
      this.removeFromDiskQueue(handle.id);
      return;
    }

    let OperationClass = this.operations[metadata.name];

    if (OperationClass.REQUIRES_BLOB && !await fs.exists(blobPath)) {
      log.warn(`
        Blob is missing from: ${handle.path}
        Cleaning up operation directory...
      `);
      await Operation.removeFromDisk(handle.path);
      this.removeFromDiskQueue(handle.id);
      return;
    }


    if (!OperationClass) {
      throw new Error(`
        Unknown operation class ${metadata.name}
      `);
    }

    let operation = new OperationClass(metadata);

    // We pass the _path_ to the file rather then the stream so readers do not
    // buffer the remainder.
    let result = await operation.write(blobPath);

    if (result.done) {
      log.info(`Successfully finished operation ${handle.path}`);
      await Operation.removeFromDisk(handle.path);
      this.removeFromDiskQueue(handle.id);
      this.emit('finished operation', operation);
    } else {
      this.emit('failed operation', operation);

      // Cleanup any remainder stream if we failed to complete this operation.
      if (result.remainder && result.remainder.destroy) {
        result.remainder.destroy();
      }

      // Configure the retry delay for this item in the queue...
      handle.retries = handle.retries || 0;
      let retryDelayMs  =
        Math.min(MAX_BACKOFF_MS, this.backoffInterval * handle.retries);

      handle.retries++;
      handle.delay = Date.now() + retryDelayMs;
      if (handle.retries < MAX_RETRIES) {
        log.info(`Failed ${handle.retries} times, retry in ${retryDelayMs}ms:`, handle.path);
        return;
      }
      log.warn(`Failed ${MAX_RETRIES} times, DELETING`, handle.path);
      await Operation.removeFromDisk(handle.path);
      this.removeFromDiskQueue(handle.id);
    }
  }
}
