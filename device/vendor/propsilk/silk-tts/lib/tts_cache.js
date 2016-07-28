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
const CACHE_LENGTH = 500;

/**
 * This class provides a cache implementation for Text-To-Speech service to cache
 * common occurences of text to speech to save network bandwidth and time. Files
 * in CACHE_DIR_SYSTEM are the ones that come as part of factory image. The files
 * in CACHE_DIR_DATA are the ones that are cached on the fly.
 */
export default class TtsCache {

  _cache: {[key: string]: {data: Buffer, mtime: number}} = {};
  _cacheLoadingPromise: Promise<void>;

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
      let filePath = path.join(dir, file);
      let data = await fs.readFile(filePath);
      let stat = await fs.stat(filePath);
      this._cache[file] = {data, mtime: stat.mtime.getTime()};
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
      await this._cleanup(CACHE_DIR_DATA);
      this._cacheLoadingPromise = this._init();
    }
    let key = this._getSha(text);
    let data = this._cache[key] ? this._cache[key].data : null;

    // Update the time of the entry to prevent it from being removed from the cache
    if (data) {
      await this._updateTime(CACHE_DIR_DATA, key);
    }

    return data;
  }

  /**
   * Update the timestamp of the cache entry
   */
  async _updateTime(dir: string, file: string) {
    let filePath = path.join(dir, file);
    let now = new Date();
    try {
      let fd = await fs.open(filePath, 'r');
      await fs.futimes(fd, now, now); // Change the file timestamp
      await fs.close(fd);
      this._cache[file].mtime = now.getTime();
    } catch (err) {
      log.warn(err);
    }
  }

  /**
   * Delete the cache as something horribly went wrong
   */
  _cleanup(dir: string) {
    return new Promise((resolve, reject) => {
      fsextra.remove(dir, err => {
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
  async _purgeCache(dir: string) {
    if (Object.keys(this._cache).length >= CACHE_LENGTH) {
      // Find the oldest entry
      let oldest = {key: '', mtime: Date.now()};
      for (let key in this._cache) {
        if (this._cache.hasOwnProperty(key)) {
          if (this._cache[key].mtime < oldest.mtime) {
            oldest = {key, mtime: this._cache[key].mtime};
          }
        }
      }
      await this._purgeCacheEntry(dir, oldest.key);
    }
  }

  /**
   * Purge a single entry from the cache
   */
  async _purgeCacheEntry(dir: string, key: string) {
    let filePath = path.join(dir, key);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      log.warn(err);
    }
    delete this._cache[key];
  }

  /**
   * Add an entry to the cache
   */
  _addCacheEntry(dir: string, text: string, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      let key = this._getSha(text);
      writeFileAtomic(path.join(dir, key), data, err => {
        if (err) {
          return reject(err);
        }
        this._cache[key] = {data, mtime: Date.now()};
        return resolve();
      });
    });
  }

  /**
   * Cache the tts entry with hash of the text as the filename
   */
  async add(text: string, data: Buffer) {
    log.debug(`Adding cache entry: ${text}`);

    try {
      await this._purgeCache(CACHE_DIR_DATA); // Purge the oldest entry
      await this._addCacheEntry(CACHE_DIR_DATA, text, data);  // Add the new entry
    } catch (err) {
      log.warn(err);
    }
  }
}
