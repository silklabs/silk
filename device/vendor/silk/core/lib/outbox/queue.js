/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/*eslint no-loop-func:0*/

import assert from 'assert';
import fs from 'mz/fs';
import { statSync } from 'fs';
import path from 'path';
import createLog from '../log';

import { EventEmitter } from 'events';
import Operation from './operation';

const log = createLog('outbox:queue');

const MAX_BACKOFF_MS = (1000 * 60) * 60; // 1 hour


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

type ThrottledCallbackType = (running: number, concurrencyMax: number) => boolean;

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
  // (disk and live)
  concurrency = 3;

  // Maximum number of allowed diskQueue concurrent operations in the queue.
  // (should always be < than concurrency)
  diskConcurrency = 2;

  // Number of running operations in the queue (should always be < than
  // concurrency)
  running = 0;

  // Callback function to check if this queue should not start any more
  // operations regardless of its current concurrency count
  throttledCallback: ThrottledCallbackType = null;

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


    // The outbox needs to be fully enumerated before continuing so heads down
    // and let's make this as quick as possible.
    let items = [];
    log.verbose(`statSyncing ${paths.length} entries`);
    paths.forEach((directoryPath) => {
      const absPath = path.join(storagePath, directoryPath);
      const value = statSync(absPath);

      if (value.isDirectory()) {
        items.push(parseInt(directoryPath, 10));
      } else {
        log.warn(`Skipping over path which is not a directory: ${absPath}`);
      }
    });
    log.verbose(`statSync-ing complete`);
    return items;
  }

  constructor(options) {
    super();
    Object.assign(this, options);

    assert.ok(this.concurrency && this.concurrency > 0);
    assert.ok(this.diskConcurrency && this.diskConcurrency <= this.concurrency);
    assert.ok(this.maxRetries && this.maxRetries > 0);
    assert.ok(this.maxEntries && this.maxEntries > 0);
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

  isThrottled(concurrencyMax): boolean {
    if (this.running >= concurrencyMax) {
      return true;
    }
    if (this.throttledCallback !== null) {
      return this.throttledCallback(this.running, concurrencyMax);
    }
    return false;
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
    } else if (this.isThrottled(this.concurrency)) {
      log.info(`${this.name} too many concurrent operations ` +
               `(${this.running}/${this.concurrency}), saving to disk`);
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

    if (Number.isInteger(result.error.code) &&
        result.error.code >= /*HTTP status code*/ 400 &&
        result.error.code !== /*HTTP status code*/ 500) {
      // Pretty clear signal that the server told us to go away
      log.warn(`Error ${result.error.code} while adding ${this.name} operation, DELETING`, result.error);
      return;
    }
    log.warn(`Error while running ${this.name} operation, saving to disk:`, result.error);
    await this._appendToDisk(operation, result.remainder);
  }

  async _appendToDisk(operation, readable) {

    while (this.diskQueue.length >= this.maxEntries) {
      let handle = { running: true };
      // Look for the oldest item in the queue and delete it. Operations are
      // removed sequentially since each removal is async, so the queue itself
      // could change while running this (async) while loop
      for (let id of this.diskQueue) {
        handle = this.diskQueueState.get(id);
        if (!handle.running) {
          break;
        }
      }
      if (!handle.running) {
        log.warn(`${this.name} disk queue is full, DELETING ${handle.path}`);
        this.removeFromDiskQueue(handle);
      }
    }


    let handle = this.createDiskQueueId();
    // Mark the handle as running to ensure we do not race against ourselves
    // when writing out the files to disk!
    handle.running = true;

    log.verbose(`Saving operation to disk: ${handle.path}`);

    try {
      await operation.saveToDisk(readable, handle.path);
      this.emit('saved operation', handle);
    } catch (err) {
      log.error(`
        Failed to save ${this.name} operation to disk (${handle.path}):

        ${err.stack}
      `);
      try {
        this.removeFromDiskQueue(handle);
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

  async removeFromDiskQueue(handle) {
    // Remove from diskQueue before physically removing from disk, to avoid the
    // operation from getting scheduled to run while it's being removed from
    // disk.
    let idx = this.diskQueue.indexOf(handle.id);
    if (idx !== -1) {
      this.diskQueue.splice(idx, 1);
      this.diskQueueState.delete(handle.id);
    }
    await Operation.removeFromDisk(handle.path);
    this.emit('removed operation', handle);
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

  workDiskQueue(chatty = false) {
    const uptime = process.uptime();

    // Work the disk queue backwards so that newer operations are preferred
    // over older operations.  This has the benefit of working at the "same end
    // of the queue" as live operations. For example when the network can't
    // keep up and the disk queue grows the set of operations that can't be
    // uploaded are more likely to be collected into larger blobs of darkness.
    // This is analogous to turning the lights off for 5mins versus toggling the
    // lights on/off every second for 10 minutes.
    for (let idx = this.diskQueue.length - 1; idx >= 0; --idx) {
      if (this.isThrottled(this.diskConcurrency)) {
        if (chatty) {
          log.verbose(`${this.name} reached max running disk operations, max:` +
            `${this.diskConcurrency} running:${this.running} ` +
            `diskqueue:${this.diskQueue.length}`
          );
        }
        break;
      }

      const id = this.diskQueue[idx];
      let handle = this.diskQueueState.get(id);

      // Skip over anything that is currently running...
      if (handle.running) {
        continue;
      }

      // Skip over anything that is not ready to be retried...
      if (handle.delay && handle.delay > uptime) {
        log.debug(`${handle.path} retry in ${handle.delay - uptime}s`);
        continue;
      }

      ++this.running;
      handle.running = true;
      handle.promise = async () => {
        try {
          await this._workDiskQueueItem(handle);
        } catch(err) {
          log.error('Error working queue', err.stack);
        }
        handle.running = false;
        --this.running;

        // Try to schedule more work
        if (this.diskCheckRunning) {
          this.workDiskQueue();
        }
      }();
    }

    // Periodic timer to catch retries and new additions to the work queue
    if (this.diskCheckRunning && !this.diskCheckHandle) {
      this.diskCheckHandle = setTimeout(
        () => {
          this.diskCheckHandle = null;
          this.workDiskQueue(/* chatty = */ true);
        },
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
    clearTimeout(this.diskCheckHandle);
    this.diskCheckHandle = null;
    this.diskCheckRunning = false;
    log.info(`Stop check for pending ${this.name} ops. online=${this.online}`);
  }

  /**
   * Attempt to gracefully shutdown the queue will return a promise which will
   * resolve when all outstanding work is complete (immediately stops polling
   * for pending operations).
   */
  async shutdown() {
    log.info(`Shutting down ${this.name}: running=${this.running}`);
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
        Clean shutdown of ${this.name} impossible:
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
      this.removeFromDiskQueue(handle);
      return;
    }

    let metadata = await fs.readFile(metadataPath, 'utf8');
    try {
      metadata = JSON.parse(metadata);
    } catch (err) {
      log.error(`Invalid metadata in operation... Purging operation directory`);
      this.removeFromDiskQueue(handle);
      return;
    }

    let OperationClass = this.operations[metadata.name];

    if (OperationClass.REQUIRES_BLOB && !await fs.exists(blobPath)) {
      log.warn(`
        Blob is missing from: ${handle.path}
        Cleaning up operation directory...
      `);
      this.removeFromDiskQueue(handle);
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
      this.removeFromDiskQueue(handle);
      this.emit('finished operation', operation);
    } else {
      this.emit('failed operation', operation);

      // Cleanup any remainder stream if we failed to complete this operation.
      if (result.remainder && result.remainder.destroy) {
        result.remainder.destroy();
      }

      if (Number.isInteger(result.error.code) &&
          result.error.code >= /*HTTP status code*/ 400 &&
          result.error.code !== /*HTTP status code*/ 500) {
        // Pretty clear signal that the server told us to go away
        log.warn(`Server rejected ${this.name} with ${result.error.code}, DELETING`, handle.path);
      } else {
        // Configure the retry delay for this item in the queue...
        handle.retries = handle.retries || 0;
        let retryDelayMs =
          Math.min(MAX_BACKOFF_MS, this.backoffInterval * handle.retries);

        handle.retries++;
        handle.delay = process.uptime() + retryDelayMs / 1000;
        if (handle.retries < this.maxRetries) {
          log.info(`Failed ${this.name} ${handle.retries} times, retry in ${retryDelayMs}ms:`, handle.path);
          return;
        }
        log.warn(`Failed ${this.name} ${this.maxRetries} times, DELETING`, handle.path);
        this.emit('giveup operation', operation);
      }
      this.removeFromDiskQueue(handle);
      await Operation.removeFromDisk(handle.path);
    }
  }
}
