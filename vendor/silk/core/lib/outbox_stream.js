/*eslint no-loop-func:0*/

import assert from 'assert';
import fs from 'mz/fs';
import path from 'path';
import createLog from './log';

import { EventEmitter } from 'events';
import StreamOperation from './outbox/operation';

const log = createLog('outbox-stream');

const DEFAULT_STORAGE_PATH = path.join(process.cwd(), '/.outbox');
const DEFUALT_QUEUE_NAME = 'default-queue';
const DEFAULT_POLL_INTERVAL = 1000; // 1 second
const MAX_BACKOFF = (1000 * 60) * 60; // 1 hour

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
export class Queue extends EventEmitter {

  /**
   * Location where we persist data on disk.
   */
  storagePath = null
  operations = {};

  /**
   * An array of promises holding all running "live" operations only used to
   * facilitate clean shutdowns.
   */
  liveOperations = []

  // Promise when loading disk queue...
  _pendingDiskQueueLoad = null

  /**
   * An array of directory names which are pending upload once the queue is
   * online.
   */
  diskQueue = []
  diskQueueState = new Map()

  // setTimeout handle:
  diskCheckHandle = null
  // Used to indicate if we should check for more work:
  diskCheckRunning = false

  // How long to wait between checks to do more operations (in ms)
  backoffInterval = 0
  // Maximum number of allowed concurrent operations in the queue.
  concurrency = 20
  // Number of running operations in the queue (should always be < than
  // concurrency)
  running = 0

  /**
   * When online the queue will attempt to write operations to their
   * destination. When false everything is immediately stored to disk.
   */
  online = true

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
      result.push(paths[idx]);
      return result;
    }, []);
  }

  constructor(storagePath) {
    super();
    this.storagePath = storagePath;

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

    /**
     * Live operations are given higher priority then pending ones so while we
     * increment the `.running` counter here we only throttle pending
     * operations.
     */
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

    // No reason to attempt a write call on the operation if we are offline.
    if (!this.online) {
      log.info('Operation while offline saving to disk....');
      await this._appendToDisk(operation, readable);
      return;
    }

    let result = await operation.write(readable);
    if (result.done) {
      this.emit('finished operation', operation);
      log.info('Successfully ran operation', operation);
      return;
    }

    this.emit('failed operation', operation);
    log.warn(`Error while running operation`, operation.error);
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
        log.info(
          `${handle.path} will be retried in`,
          handle.delay - now
        );
        continue;
      }

      if (this.running >= this.concurrency) {
        log.info('Reached maximum number of running operations', this.running);
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
    let metadataPath = path.join(handle.path, StreamOperation.METATADATA_NAME);
    let blobPath = path.join(handle.path, StreamOperation.BLOB_NAME);

    // Ensure they both exist ... If for some reason they don't cleanup the
    // directory and move on...
    let [metadataExists, blobExists] = await Promise.all([
      fs.exists(metadataPath),
      fs.exists(blobPath),
    ]);

    if (!metadataExists || !blobExists) {
      log.warn(`
        Either metadata or blob is missing from: ${handle.path}

        Cleaning up operation directory...
      `);

      await StreamOperation.removeFromDisk(handle.path);
      this.removeFromDiskQueue(handle.id);
      return;
    }

    let metadata = await fs.readFile(metadataPath, 'utf8');
    metadata = JSON.parse(metadata);

    let OperationClass = this.operations[metadata.name];

    if (!OperationClass) {
      throw new Error(`
        Unknown operation class ${metadata.name}
      `);
    }

    let operation = new OperationClass(metadata);
    let readable = fs.createReadStream(blobPath);

    let result = await operation.write(readable);
    if (result.done) {
      log.info(`Successfully finished operation ${handle.path}`);
      await StreamOperation.removeFromDisk(handle.path);
      this.removeFromDiskQueue(handle.id);
      this.emit('finished operation', operation);
    } else {
      this.emit('failed operation', operation);

      // Configure the retry delay for this item in the queue...
      handle.retries = handle.retries || 0;
      let retryDelay =
        Math.min(MAX_BACKOFF, this.backoffInterval * handle.retries);

      handle.retries++;
      handle.delay = Date.now() + retryDelay;

      log.info(`Failed during retry will try again later`, {
        handle,
        retryIn: retryDelay
      });
    }
  }
}

export class Outbox {
  /**
   * Where on disk we will store outstanding uploads.
   */
  storagePath = null

  // Default queue
  queue = null

  set online(value) {
    this.queue.online = value;
  }

  /**
   * Simple wrapper... In theory we may also want to turn individual queues off
   * but we don't need that complexity now.
   */
  get online() {
    return this.queue.online;
  }

  _hintSocket = null

  get hintSocket() {
    return this._hintSocket;
  }

  set hintSocket(socket) {
    if (this._hintSocket) {
      this._hintSocket.removeListener('connect', this.resetBackOff);
    }

    if (socket) {
      socket.on('connect', this.resetBackOff);
    }

    this._hintSocket = socket;
  }

  /**
   * Begin checking for operations...
   */
  start(interval = DEFAULT_POLL_INTERVAL) {
    this.queue.start(interval);
  }

  /**
   * Reset any backoff in pending operations...
   *
   * (implicitly bound to self so we can remove it later from hint)
   */
  resetBackOff = () => {
    return this.queue.resetBackOff();
  }

  shutdown() {
    return this.queue.shutdown();
  }

  /**
   * Stop checking for pending operations...
   */
  stop() {
    return this.queue.stop();
  }

  constructor(options = {}) {
    Object.assign(this, options);
  }

  // XXX: Purely for future compatibility.
  registerOperation(operationClass) {
    assert(operationClass.BLOB_NAME, 'must have .BLOB_NAME');
    assert(operationClass.METATADATA_NAME, 'must have .METATADATA_NAME');
    this.queue.operations[operationClass.NAME] = operationClass;
  }

  addToQueue(operation, readable) {
    return this.queue.add(operation, readable);
  }
}

export function createOutbox(options) {
  // Find the storage path where pending operations are being held.
  let storagePath = options.storagePath || DEFAULT_STORAGE_PATH;
  let queueStoragePath = path.join(storagePath, DEFUALT_QUEUE_NAME);
  // Operations for the default queue on disk...

  /**
   * TODO: For the moment we have one single queue and no concept of different
   * types of throttling or priority _maybe_ that is fine forever but probably
   * not. This interface is designed so we can easily make it more complex and
   * span to N queues.
   */
  let queue = new Queue(queueStoragePath);

  return new Outbox(Object.assign({}, options, { queue }));
}
