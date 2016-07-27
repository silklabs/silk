/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 * @private
 */

import createLog from 'silk-log/device';
import fs from 'mz/fs';
import path from 'path';
import mkdirp from 'mkdirp-promise';
import fsextra from 'fs-extra';
import crypto from 'crypto';

const log = createLog('tts-cache');
const CACHE_DIR_DATA = 'data/media/tts/';
const CACHE_DIR_SYSTEM = 'system/silk/media/tts/';

/**
 * This class provides a cache implementation for Text-To-Speech service to cache
 * common occurences of text to speech to save network bandwidth and time. Files
 * in CACHE_DIR_SYSTEM are the ones that come as part of factory image. The files
 * in CACHE_DIR_DATA are the ones that are cached on the fly.
 */
export default class TtsCache {

  _cache: {[key: string]: Buffer} = {};
  _cacheLoadingPromise: Promise<void> = Promise.resolve();

  constructor() {
    this._cacheLoadingPromise = this._init();
  }

  // Initialize the cache
  async _init() {
    this._cache = {};
    if ((await fs.exists(CACHE_DIR_DATA)) === false) {
      await mkdirp(CACHE_DIR_DATA);
    }
    await this._populateCacheFrom(CACHE_DIR_DATA);
    await this._populateCacheFrom(CACHE_DIR_SYSTEM);
  }

  /**
   * Populate the cache from the provided directory
   */
  async _populateCacheFrom(dir: string) {
    if ((await fs.exists(dir)) === false) {
      log.warn(`cache dir ${dir} doesn't exist`);
      return;
    }
    let files = await fs.readdir(dir);

    let readFile = async (file) => {
      let data = await fs.readFile(path.join(dir, file));
      this._cache[file] = data;
    };

    // Go through the list of files and populate the cache
    let promises = [];
    files.forEach(async (file) => {
      promises.push(readFile(file));
    });
    await Promise.all(promises);
    log.debug(`Done reading cache ${dir}`);
  }

  _getSha(text: string): string {
    let sha = crypto.createHash('sha1').update(text.toLowerCase(text)).digest('hex');
    return sha;
  }

  /**
   * Return the cached pcm buffer if the provided text is cached
   */
  async get(text: string) {
    try {
      // Wait for cache to be loaded if not finished loading already
      await this._cacheLoadingPromise;
    } catch (err) {
      log.warn(`Failed to prepopulate cache: `, err);
      await this._cleanup(CACHE_DIR_DATA);
      this._cacheLoadingPromise = this._init();
    }
    let key = this._getSha(text);
    return this._cache[key];
  }

  _cleanup() {
    return new Promise((resolve, reject) => {
      fsextra.remove(CACHE_DIR_DATA, err => {
        if (err) {
          return reject();
        }
        return resolve();
      });
    });
  }

  /**
   * Cache the tts entry with hash of the text as the filename
   */
  add(text: string, data: Buffer) {
    log.debug(`Adding cache entry: ${text}`);
    let key = this._getSha(text);
    this._cache[key] = data;
    fs.writeFile(path.join(CACHE_DIR_DATA, key), data);
  }
}
