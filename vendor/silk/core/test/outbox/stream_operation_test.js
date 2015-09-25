/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
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
        cb(new Error('failed'));
        return false;
      }
      return super._write(buffer, encoding, cb);
    }
  }

  class FailableOp extends StreamOperation {
    static NAME = 'failable';
    static StreamClass = FailableWriter
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

  test('.write', async () => {
    let { stream, buffer } = randomStream();
    let operation = new TestOp({
      arguments: {
        woot: true
      }
    });

    let destination = operation.destination;
    let writePromise = operation.write(stream);

    await writePromise;

    assert.deepEqual(destination.arguments, { woot: true });
    assert.equal(destination.result.toString(), buffer.toString());
  });

});

