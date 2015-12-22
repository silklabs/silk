/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import { exec } from 'mz/child_process';
import path from 'path';
import createOutbox from '../../lib/outbox/manager';
import StreamOperation from '../../lib/outbox/stream_operation';
import streams from 'stream';
import randomStream from '../random_stream';
import fs from 'mz/fs';
import assert from 'assert';

const FIXTURE_DIR = path.join(__dirname, '/outbox_fixture');

suite('outbox stream', () => {

  class TestWriter extends streams.Writable {
    arguments = {};
    result = new Buffer(0);

    constructor(opts) {
      super();
      this.arguments = opts;
      this.once('finish', () => this.emit('close'));
    }

    _write(buffer, encoding, cb) {
      this.result = Buffer.concat([this.result, buffer]);
      process.nextTick(cb);
      return true;
    }
  }

  class TestOp extends StreamOperation {
    static NAME = 'test'
    static StreamClass = TestWriter
  }

  class FailableWriter extends TestWriter {
    failOnNth = 5
    nth = 0

    constructor(opts) {
      super(opts);
      this.failOnNth = opts.failOnNth;
      this.once('finish', () => this.emit('close'));
    }

    _write(buffer, encoding, cb) {
      if (this.nth++ >= this.failOnNth) {
        process.nextTick(() => {
          cb(new Error('failed'));
        });
        return null;
      }
      return super._write(buffer, encoding, cb);
    }
  }

  class FailableOp extends StreamOperation {
    static NAME = 'failable';
    static StreamClass = FailableWriter
  }

  class ImmediateFail extends StreamOperation {
    static NAME = 'failable';
    static StreamClass = () => {
      let stream = new streams.PassThrough();
      process.nextTick(() => {
        stream.emit('error', new Error('throw!'));
      });
      return stream;
    }
  }

  class TimeoutOp extends StreamOperation {
    static NAME = 'failable';
    static MAX_UPLOAD_TIME = 0;
    static StreamClass = () => {
      let stream = new streams.PassThrough();
      setTimeout(() => {
        stream.emit('close');
      }, 100);
      return stream;
    }
  }

  async function cleanup() {
    await exec(`rm -rf ${FIXTURE_DIR}`);
  }

  setup(cleanup);
  teardown(cleanup);

  let subject;
  setup(() => {
    subject = createOutbox({
      storagePath: FIXTURE_DIR
    });

    subject.registerOperation(TestOp);
    subject.registerOperation(FailableOp);
    subject.registerOperation(ImmediateFail);
    subject.registerOperation(TimeoutOp);
  });

  test('.saveToDisk', async () => {
    let { stream, buffer } = randomStream();
    let operation = new FailableOp({
      arguments: {
        failOnNth: 3
      }
    });

    let writePromise = operation.write(stream);
    let result = await writePromise;
    assert.ok(result.error, 'operation has failed');
    assert.ok(!result.done, 'did fail to write');

    let directory = path.join(FIXTURE_DIR, 'stuff/v1/');
    // Persist to disk....
    await operation.saveToDisk(
      result.remainder,
      directory
    );

    let blobPath = path.join(directory, 'blob');
    let metadataPath = path.join(directory, 'metadata.json');

    let [blob, metadata] = await Promise.all([
      fs.readFile(blobPath),
      fs.readFile(metadataPath, 'utf8'),
    ]);

    // Re-hydrate from disk...
    metadata = JSON.parse(metadata);
    assert.equal(blob.toString(), buffer.toString());
    metadata.arguments.failOnNth = 10000;

    let readableStream = fs.createReadStream(blobPath);
    let retryOp = new FailableOp(metadata);

    let res = await retryOp.write(readableStream);
    assert.ok(res.done, 'successfully writes');
  });

  test('.saveToDisk - passing file path', async () => {
    await fs.mkdir(FIXTURE_DIR);
    let { buffer } = randomStream();
    let operation = new FailableOp({
      arguments: {
        failOnNth: 3
      }
    });

    // Write some bytes to the file...
    let originalFile = path.join(FIXTURE_DIR, 'original_blob');
    await fs.writeFile(originalFile, buffer);

    let directory = path.join(FIXTURE_DIR, 'stuff/v1/');

    // Persist the operation on disk but pass a path instead of readable stream
    // as the remainder...
    await operation.saveToDisk(
      originalFile,
      directory
    );

    let blobPath = path.join(directory, 'blob');

    // The original file should now be moved to the blob path.
    assert.ok(!await fs.exists(originalFile));
    let blob = await fs.readFile(blobPath, 'utf8');
    assert.equal(blob, buffer.toString());
  });

  test('.write', async () => {
    let { stream, buffer } = randomStream();
    let operation = new TestOp({
      arguments: {
        woot: true
      }
    });

    let writePromise = operation.write(stream);
    await writePromise;
    let destination = operation.destination;

    assert.deepEqual(destination.arguments, { woot: true });
    assert.equal(destination.result.toString(), buffer.toString());
  });

  test('.write - with immediately thrown error', async () => {
    let { stream } = randomStream();
    let operation = new ImmediateFail({
      arguments: {}
    });

    // Run some async operation after creating the operation... This will
    // simulate the case where the exception is thrown in the next tick while we
    // are busy doing something else..
    await fs.readdir(__dirname);

    let result = await operation.write(stream);
    assert.ok(!result.ok);
    assert.ok(result.error.message.indexOf('throw') !== -1);
  });

  test('.write - with timeout', async () => {
    let { stream } = randomStream();
    let operation = new TimeoutOp({
      arguments: {}
    });

    // Run some async operation after creating the operation... This will
    // simulate the case where the exception is thrown in the next tick while we
    // are busy doing something else..
    await fs.readdir(__dirname);

    let result = await operation.write(stream);
    assert.ok(!result.ok);
    assert.ok(result.error.message.indexOf('timeout') !== -1);
  });

});

