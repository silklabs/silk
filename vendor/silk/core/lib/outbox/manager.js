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
import { getintprop } from '../sysutils';

import { EventEmitter } from 'events';
import Queue from './queue';
import Operation from './operation';

const log = createLog('outbox:manager');

const DEFAULT_STORAGE_PATH = path.join(process.cwd(), '/.outbox');
const DEFUALT_QUEUE_NAME = 'default-queue';
const DEFAULT_POLL_INTERVAL = 1000; // 1 second
const MAX_BACKOFF = (1000 * 60) * 60; // 1 hour

export class Outbox {
  /**
   * Where on disk we will store outstanding uploads.
   */
  storagePath = null

  // Default queue
  queue = null

  set online(value) {
    log.info(`status online = ${value}`);
    this.queue.online = value;
  }

  /**
   * Simple wrapper... In theory we may also want to turn individual queues off
   * but we don't need that complexity now.
   */
  get online() {
    return this.queue.online;
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

export default function createOutbox(options) {
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
