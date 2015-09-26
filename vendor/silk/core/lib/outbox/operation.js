/**
 * Base class for our "operations" this deals with cleaning up and persisting
 * state to disk when operations fail... Individual subclasses must implement
 * the important bits of actually writing to streams.
 *
 *
 * ```js
 *
 * // bare minimum implementation
 * class MyOperation extends Operation {
 *   static NAME = 'my-example-operation'
 *
 *   async getMetadata() {
 *     return { name: this.constructor.NAME }
 *   }
 *
 *   async write(readable) {
 *     // ... do stuff to readable stream
 *     return { done: true, remainder: ReadableStream };
 *   }
 * }
 *
 * ```
 */
import assert from 'assert';
import createLog from '../log';
import fs from 'mz/fs';
import path from 'path';
import eventToPromise from 'event-to-promise';
import mkdirp from 'mkdirp-promise';

const log = createLog('outbox:operation');

export default class Operation {

  static BLOB_NAME = 'blob';
  static METATADATA_NAME = 'metadata.json';

  // We must name our operations so we know which class to use when loading from
  // disk...
  static NAME = '';

 /**
   * Cleanup the left overs in the retry operation.
   *
   * This method intentionally is a little verbose and does some extra sanity
   * checks these could potentially be simplified to something closer to what
   * `rm -rf` does.
   */
  static async removeFromDisk(directory) {
    if (!(await fs.exists(directory))) {
      log.info(`(removeFromDisk) directory not found ${directory}`);
      return;
    }

    let blobPath = path.join(directory, this.BLOB_NAME);
    let metadataPath = path.join(directory, this.METATADATA_NAME);

    try {
      let [blob, metadata] = await Promise.all([
        fs.exists(blobPath),
        fs.exists(metadataPath),
      ]);

      if (blob) {
        await fs.unlink(blobPath);
      }

      if (metadata) {
        await fs.unlink(metadataPath);
      }

      await fs.rmdir(directory);

    } catch (err) {
      log.error(`
        Could not clean up ${directory} correctly this likely will result in an
        accumulation of disk space (very bad)

        ${err.stack}
      `);
    }
  }

  constructor() {
    if (!this.constructor.NAME) {
      throw new Error('.NAME static property must be defined');
    }
  }

  /**
   * Must return an object the .getMetadata must include `.name` property.
   */
  getMetadata(overrides = {}) {
    let metadata = this._getMetadata();
    assert(typeof metadata === 'object');

    return Object.assign(
      {},
      // Ensure we include .name so implementors don't need to...
      { name: this.constructor.NAME },
      metadata,
      overrides
    );
  }

  _getMetadata(overrides) { //eslint-disable-line no-unused-vars
    throw new Error('._getMetadata must be implemented');
  }

  /**
   * Should return a promise that resolves with :
   *
   *    {
   *      done: true, // If true we know we do not need to persist to disk
   *      remainder: <stream.Readable> // Remainder to persist (done = false)
   *    }
   *
   */
  async write(readable) {
    assert(readable, 'must pass readable');
    let result = await this._write(readable);
    assert(('done' in result), '._write result must contain .done');

    if (!result.done) {
      assert(
        result.remainder,
        '._write result with done=false must include remainder'
      );
    }

    return result;
  }

  async _write(readable) { //eslint-disable-line no-unused-vars
    throw new Error('Must implement ._write');
  }

  async _writeMetadata(directory, overrides) {
    let metadata = this.getMetadata(overrides);
    if (!metadata.name) {
      throw new Error(`
        getMetadata call must include a .name property to indicate which
        Operation class is in use!
      `);
    }

    let metadataPath = path.join(directory, this.constructor.METATADATA_NAME);

    // We assume whoever calls this is going to handle any write errors.
    await fs.writeFile(metadataPath, JSON.stringify(metadata));
  }

  async _writeBlob(directory, readable) {
    let blobPath = path.join(directory, this.constructor.BLOB_NAME);

    if (typeof readable === 'string') {
      // treat readable as a path to a file...

      if (!await fs.exists(readable)) {
        throw new Error(
          `Cannot move ${readable} to ${blobPath} does not exist.`
        );
      }

      if (await fs.exists(blobPath)) {
        throw new Error(
          `Will not move ${readable} to ${blobPath} it already exists...`
        );
      }

      log.info(`Moving ${readable} to ${blobPath}`);

      // Simply move the file to be the blob so we don't have to load it in
      // memory at all...
      await fs.rename(readable, blobPath);
    } else {
      log.info(`Draining readable to ${blobPath}`);
      let blobWritableStream = fs.createWriteStream(blobPath);
      readable.pipe(blobWritableStream);
      await eventToPromise(blobWritableStream, 'close');
    }
  }

  /**
   * Save the readable stream and metadata to the given directory.
   *
   * The operation does not make any assumptions about the directory itself but
   * callers should use this in conjunction with the methods to properly queue
   * disk writes.
   *
   * Format on disk:
   *
   *    <directory>/blob - Contents of the readable stream
   *    <directory>/metadata.json - Description of the operation.
   *
   */
  async saveToDisk(readable, directory) {
    log.verbose(`Preparing to save to disk`, {
      directory,
      metadata: this.getMetadata()
    });

    try {
      // Ensure the directory exists in full...
      await mkdirp(directory);

      // Pipe the remainder stream to disk.
      await Promise.all([
        this._writeMetadata(directory, {
          createdAt: Date.now()
        }),
        this._writeBlob(directory, readable)
      ]);
    } catch (err) {
      log.error(`
        Could not successfully persist all information required to retry an
        operation for ${this.name}
      `, this.arguments);

      try {
        await this.constructor.removeFromDisk(directory);
      } catch (errRemoveDisk) {
        log.error(`
          Unexpected error removing files from disk

          ${errRemoveDisk.stack}
        `);
        throw errRemoveDisk;
      }

      // Allow this error to bubble up to consumers as we know for sure this has
      // failed.
      throw err;
    }
  }
}
