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
import writeFileAtomic from 'write-file-atomic';

const log = createLog('tts-cache');
const CACHE_DIR_DATA = 'data/media/tts/';
const CACHE_DIR_SYSTEM = 'system/silk/media/tts/';
const DATA_CACHE_LENGTH = 500;

type CacheType = {[key: string]: {data: Buffer, mtime: number}};

/**
 * This class provides a cache implementation for Text-To-Speech service to cache
 * common occurences of text to speech to save network bandwidth and time. Files
 * in CACHE_DIR_SYSTEM are the ones that come as part of factory image. The files
 * in CACHE_DIR_DATA are the ones that are cached on the fly.
 */
export default class TtsCache {

  _dataCache: CacheType = {};
  _systemCache: CacheType = {};
  _cacheLoadingPromise: Promise<void>;

  constructor() {
    this._cacheLoadingPromise = this._init();
  }

  // Initialize the cache
  async _init() {
    this._dataCache = {};
    if ((await fs.exists(CACHE_DIR_DATA)) === false) {
      await mkdirp(CACHE_DIR_DATA);
    }
    await this._populateCacheFrom(CACHE_DIR_DATA, this._dataCache);
    await this._populateCacheFrom(CACHE_DIR_SYSTEM, this._systemCache);
  }

  /**
   * Populate the cache from the provided directory
   */
  async _populateCacheFrom(dir: string, cache: CacheType): Promise<void> {
    if ((await fs.exists(dir)) === false) {
      log.warn(`cache dir ${dir} doesn't exist`);
      return;
    }
    let files = await fs.readdir(dir);

    let readFile = async (file) => {
      let filePath = path.join(dir, file);
      let data = await fs.readFile(filePath);
      let stat = await fs.stat(filePath);
      cache[file] = {data, mtime: stat.mtime.getTime()};
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
  async get(text: string): Promise<?Buffer> {
    try {
      // Wait for cache to be loaded if not finished loading already
      await this._cacheLoadingPromise;
    } catch (err) {
      log.warn(`Failed to prepopulate cache: `, err);
      await this._cleanupDataCache();
      this._cacheLoadingPromise = this._init();
    }
    let key = this._getSha(text);

    // Check system cache first
    let data = this._systemCache[key] ? this._systemCache[key].data : null;
    if (data) {
      return data;
    }

    // Check data cache
    data = this._dataCache[key] ? this._dataCache[key].data : null;

    // Update the time of the entry to prevent it from being removed from the cache
    if (data) {
      await this._updateDataCacheEntry(key);
    }

    return data;
  }

  /**
   * Cache the tts entry with hash of the text as the filename
   */
  async add(text: string, data: Buffer) {
    log.debug(`Adding cache entry: ${text}`);

    try {
      await this._purgeDataCache(); // Purge the oldest entry
      await this._addDataCacheEntry(text, data);  // Add the new entry
    } catch (err) {
      log.warn(err);
    }
  }

  /**
   * Update the timestamp of the data cache entry
   */
  async _updateDataCacheEntry(file: string) {
    let filePath = path.join(CACHE_DIR_DATA, file);
    let now = new Date();
    try {
      let fd = await fs.open(filePath, 'r');
      await fs.futimes(fd, now, now); // Change the file timestamp
      await fs.close(fd);
      this._dataCache[file].mtime = now.getTime();
    } catch (err) {
      log.warn(err);
    }
  }

  /**
   * Delete the cache as something horribly went wrong
   */
  _cleanupDataCache() {
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
   * Remove the oldest entry from the cache
   */
  async _purgeDataCache() {
    if (Object.keys(this._dataCache).length >= DATA_CACHE_LENGTH) {
      // Find the oldest entry
      let oldest = {key: '', mtime: Date.now()};
      for (let key in this._dataCache) {
        if (this._dataCache.hasOwnProperty(key)) {
          if (this._dataCache[key].mtime < oldest.mtime) {
            oldest = {key, mtime: this._dataCache[key].mtime};
          }
        }
      }
      await this._purgeDataCacheEntry(oldest.key);
    }
  }

  /**
   * Purge a single entry from the cache
   */
  async _purgeDataCacheEntry(key: string) {
    let filePath = path.join(CACHE_DIR_DATA, key);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      log.warn(err);
    }
    delete this._dataCache[key];
  }

  /**
   * Add an entry to the cache
   */
  _addDataCacheEntry(text: string, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      let key = this._getSha(text);
      writeFileAtomic(path.join(CACHE_DIR_DATA, key), data, err => {
        if (err) {
          return reject(err);
        }
        this._dataCache[key] = {data, mtime: Date.now()};
        return resolve();
      });
    });
  }
}
