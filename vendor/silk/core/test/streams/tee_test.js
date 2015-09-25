/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

import TeeStream from '../../lib/streams/tee';
import streams from 'stream';
import eventToPromise from 'event-to-promise';
import assert from 'assert';

suite('tee stream', () => {

  class StoreStream extends streams.Writable {
    content = []
    _write(chunk, enc, cb) {
      this.content.push(chunk);
      cb();
      return true;
    }
  }

  class ErrorEmitStream extends streams.Writable {
    nth = 0;
    _write(chunk, enc, cb) {
      this.nth++;
      if (this.nth === 4) {
        process.nextTick(() => {
          this.emit('error', new Error('failed!'));
        });
        return;
      }

      if (this.nth > 4) {
        throw new Error('should never be called');
      }
      cb();
    }
  }

  class ErrorCbStream extends streams.Writable {
    nth = 0;
    _write(chunk, enc, cb) {
      this.nth++;
      if (this.nth === 3) {
        process.nextTick(() => {
          cb(new Error('failed ' + process.g));
        });
        return;
      }

      if (this.nth > 3) {
        throw new Error('should never be called');
      }
      cb();
    }
  }

  test('single stream with error', async () => {
    let source = new streams.PassThrough();
    let error = new ErrorEmitStream({ highWaterMark: 0 });

    // Do not care about these right now...
    error.on('error', () => {});

    let writer = new TeeStream(error);
    let errorPromise = eventToPromise(writer, 'error');

    source.pipe(writer);

    async function write() {
      return new Promise(accept => {
        source.write(new Buffer(1024), () => {
          accept();
        });
      });
    }

    for (let i = 0; i < 10; i++) {
      await write();
    }
    source.end();
    await errorPromise;
  });

  test('both streams throw an error', async () => {
    let source = new streams.PassThrough();
    let error = new ErrorEmitStream({ highWaterMark: 0 });
    let errorTwo = new ErrorCbStream({ highWaterMark: 0 });

    // Do not care about these right now...
    error.on('error', () => {});
    errorTwo.on('error', () => {});

    let writer = new TeeStream(error, errorTwo);
    let errorPromise = eventToPromise(writer, 'error');
    source.pipe(writer);

    async function write() {
      return new Promise(accept => {
        source.write(new Buffer(1024), () => {
          accept();
        });
      });
    }

    for (let i = 0; i < 10; i++) {
      await write();
    }
    source.end();
    await errorPromise;
  });

  test('write to multiple sources.', async () => {
    let source = new streams.PassThrough();
    let error = new ErrorCbStream({ highWaterMark: 0 });
    let store = new StoreStream({ highWaterMark: 0 });

    let threwError = null;
    error.on('error', (err) => {
      threwError = err;
    });

    let writer = new TeeStream(error, store);
    source.pipe(writer);

    async function write() {
      return new Promise(accept => {
        source.write(new Buffer(1024), () => {
          accept();
        });
      });
    }

    for (let i = 0; i < 10; i++) {
      await write();
    }
    source.end();

    await eventToPromise(writer, 'finish');
    assert.ok(threwError, 'error thrown in single stream');
    assert.equal(store.content.length, 10);
  });
});
