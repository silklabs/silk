/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.

 * @private
 * @flow
 */

/**
 * Storage for dialog scripts
 * @module silk-dialog-storage
 * @example
 * import storage from 'silk-dialog-storage';
 *
 * storage.get().then((data) => {
 *   // Use data.
 * }).catch((error) => {
 *   // Handle error.
 * });
 *
 * storage.set(data).then(() => {
 *   // Data has been saved.
 * }).catch((error) => {
 *   // Handle error.
 * });
 */

import createLog from 'silk-log/device';
import {dirname} from 'path';
import invariant from 'assert';
import fs from 'mz/fs';
import mkdirp from 'mkdirp-promise';
import msgpack from 'msgpack-lite';

type DialogStorageOptions = {
  // Path to the data file.
  path?: string;
};

const log = createLog('dialog-storage');

const DEFAULT_OPTIONS: DialogStorageOptions = {
  path: `data/silk/dialog-storage/data.json`,
};

/**
 * This class provides simple methods to store and retrieve data.
 * @memberof silk-dialog-storage
 */
export class DialogStorage {

  _options: DialogStorageOptions;
  _promise: Promise<void> = Promise.resolve();

  constructor(options: DialogStorageOptions = {}) {
    log.info(`DialogStorage`, options);

    this._options = Object.assign({}, DEFAULT_OPTIONS, options);
  }

  /**
   * Retrieve the data.
   *
   * @memberof silk-dialog-storage.DialogStorage
   * @instance
   */
  get(): Promise<any> {
    log.debug(`get`);

    return this._chain(() => this._get());
  }

  /**
   * Store the data.
   *
   * @param data Data to be stored
   * @memberof silk-dialog-storage.DialogStorage
   * @instance
   */
  set(data: any): Promise<void> {
    log.debug(`set`, data);

    // Encode the data right away to avoid having to worry about mutations while
    // waiting for our turn in the chain.
    if (data !== undefined) {
      data = msgpack.encode(data);
    }

    return this._chain(() => this._set(data));
  }

  _chain(func: (() => Promise<any>)): Promise<void> {
    log.debug(`_chain`);

    const promise = this._promise.then(func);

    // Log errors here without interfering with the promise we hand the caller.
    // Also attach a dummy promise on the end to make sure we don't hold the
    // result around forever.
    this._promise =
      promise.catch((error) => {
        log.warn(error);
      }).then(() => undefined);

    // Return the promise that actually resolves with the result.
    return promise;
  }

  async _get(): Promise<any> {
    log.debug(`_get`);

    const path = this._options.path;
    invariant(path);

    let encodedData: ?Buffer = null;
    try {
      encodedData = await fs.readFile(path);
    } catch (error) {
      if (error.code !== `ENOENT`) {
        throw error;
      }
      return undefined;
    }

    invariant(encodedData);
    return msgpack.decode(encodedData);
  }

  async _set(encodedData: void | Buffer): Promise<void> {
    log.debug(`_set`,
              encodedData ? `<Buffer ${encodedData.length}>` : `undefined`);

    const path = this._options.path;
    invariant(path);

    if (encodedData === undefined) {
      // Just delete the file.
      try {
        await fs.unlink(path);
      } catch (error) {
        if (error.code !== `ENOENT`) {
          throw error;
        }
      }
      return;
    }

    await mkdirp(dirname(path));
    await fs.writeFile(path, encodedData);
  }
}

/**
 * Global DialogStorage object
 * @memberof silk-dialog-storage
 */
const storage = new DialogStorage();
export default storage;
