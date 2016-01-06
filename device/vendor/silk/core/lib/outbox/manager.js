/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/*eslint no-loop-func:0*/

import assert from 'assert';
import path from 'path';
import createLog from '../log';
import { getintprop, randBetween } from '../sysutils';

import Queue from './queue';

const log = createLog('outbox:manager');

const DEFAULT_STORAGE_PATH = path.join(process.cwd(), '/.outbox');
const DEFAULT_POLL_INTERVAL = 1000; // 1 second
const OUTBOX_CONCURRENCY_PROP = 'persist.silk.outconcurrency';

const DEFUALT_QUEUE_NAME = 'default-queue';
const DEFAULT_QUEUE_CONCURRENCY = getintprop(OUTBOX_CONCURRENCY_PROP, 2);

// After this many retries, give up and delete the operation
const DEFAULT_QUEUE_MAX_RETRIES = 128;

// ext4 permits up to 64998 subdirectories (excluding . and ..) per directory
// ('dir_nlink' is not enabled for /data it seems)
const DEFAULT_QUEUE_MAX_ENTRIES = 64800; // ~18 hours of video (60 * 60 * 18)

/**
 * Maximum amount of time to stagger the queue polling intervals.
 */
const QUEUE_CHECK_STAGGER_MS = DEFAULT_POLL_INTERVAL * 0.1;

export class Outbox {
  /**
   * Where on disk we will store outstanding uploads.
   */
  storagePath = DEFAULT_STORAGE_PATH;

  // Default queue
  queues = new Map();

  _online = true;

  set online(value) {
    log.info(`status online = ${value}`);
    this._online = false;
    for (let [, queue] of this.queues) {
      queue.online = value;
    }
  }

  /**
   * Simple wrapper... In theory we may also want to turn individual queues off
   * but we don't need that complexity now.
   */
  get online() {
    return this._online;
  }

  constructor(options = {}) {
    Object.assign(this, options);
  }

  /**
   * Begin checking for operations...
   */
  start(interval = DEFAULT_POLL_INTERVAL) {
    for (let [name, queue] of this.queues) {
      // Stagger when we start the work
      let queueInterval = interval + randBetween(1, QUEUE_CHECK_STAGGER_MS);
      log.info(`Will check ${name} every ${queueInterval}`);
      queue.start(queueInterval);
    }
  }

  /**
   * Reset any backoff in pending operations...
   *
   * (implicitly bound to self so we can remove it later from hint)
   */
  resetBackOff = () => {
    for (let [, queue] of this.queues) {
      queue.resetBackOff();
    }
  };

  shutdown() {
    let pending = [];
    for (let [, queue] of this.queues) {
      pending.push(queue.shutdown());
    }
    return Promise.all(pending);
  }

  /**
   * Stop checking for pending operations...
   */
  stop() {
    let pending = [];
    for (let [, queue] of this.queues) {
      pending.push(queue.stop());
    }
    return Promise.all(pending);
  }

  // XXX: Purely for future compatibility.
  registerOperation(operationClass) {
    assert(operationClass.BLOB_NAME, 'must have .BLOB_NAME');
    assert(operationClass.METATADATA_NAME, 'must have .METATADATA_NAME');
    for (let [, queue] of this.queues) {
      queue.operations[operationClass.NAME] = operationClass;
    }
  }

  registerQueue(queueName, options, higherPriorityQueueName = null) {
    if (this.queues.has(queueName)) {
      throw new Error(`Cannot re-register queue ${queueName}`);
    }

    let storagePath = path.join(this.storagePath, queueName);
    let defaultOptions = {
      concurrency: DEFAULT_QUEUE_CONCURRENCY,
      maxRetries: DEFAULT_QUEUE_MAX_RETRIES,
      maxEntries: DEFAULT_QUEUE_MAX_ENTRIES
    };

    // higherPriorityQueueName defines another queue that should take precedence
    // over this one.  That is, if the total number of running operations across
    // this queue and the higher-priority queue exceed the concurrency threshold then
    // this queue's operations should be throttled.
    let throttledCallback = null;
    if (higherPriorityQueueName !== null) {
      let higherPriorityQueue = this.queues.get(higherPriorityQueueName);
      if (!higherPriorityQueue) {
        throw new Error(`queue does not exist: ${higherPriorityQueueName}`);
      }

      throttledCallback = (running, concurrencyMax) => {
        return running + higherPriorityQueue.running >= concurrencyMax;
      };
    }
    let queue = new Queue(Object.assign(defaultOptions, options, {
      storagePath,
      name: queueName,
      throttledCallback,
    }));

    queue.online = this.online;
    return this.queues.set(queueName, queue);
  }

  /**
   * Enqueue an operation on the default queue...
   */
  addToQueue(operation, readable) {
    return this.enqueue(DEFUALT_QUEUE_NAME, operation, readable);
  }

  /**
   * Enqueue an operation on a specific named field.
   */
  enqueue(queueName, operation, readable) {
    if (!this.queues.has(queueName)) {
      throw new Error(`${queueName} is not a valid queue name`);
    }
    return this.queues.get(queueName).add(operation, readable);
  }
}

export default function createOutbox(options) {
  let outbox = new Outbox(Object.assign({}, options));

  // Register the default queue (mostly for legacy purposes over time we will
  // migrate away from a single default queue).
  outbox.registerQueue(DEFUALT_QUEUE_NAME);

  return outbox;
}
