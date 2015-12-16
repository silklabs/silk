/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import { exec } from 'mz/child_process';
import path from 'path';
import { default as createOutbox } from '../../lib/outbox/manager';
import StreamOperation from '../../lib/outbox/stream_operation';
import Operation from '../../lib/outbox/operation';
import fs from 'mz/fs';
import assert from 'assert';
import createStreamServer from '../stream_server';
import httpStream from '../../lib/streams/http';
import eventToPromise from 'event-to-promise';
import randomStream from '../random_stream';

const FIXTURE_DIR = path.join(__dirname, '/outbox_fixture');

suite('outbox manager', () => {

  class HttpOp extends StreamOperation {
    static NAME = 'http';
    static StreamClass = (url) => {
      return httpStream(url, { method: 'post' });
    }
  }

  class NoBufferOp extends Operation {
    static REQUIRES_BLOB = false;
    static NAME = 'noopbuffer';

    constructor(options) {
      super();
      Object.assign(this, options);
    }

    _getMetadata() {
      return {
        url: this.url,
        args: this.args
      };
    }

    async _write() {
      let stream = httpStream(this.url, { method: 'post' });
      let content = new Buffer(JSON.stringify(this.args));
      stream.end(content);
      await eventToPromise(stream, 'close');

      return { done: true };
    }
  }

  async function cleanup() {
    await exec(`rm -rf ${FIXTURE_DIR}`);
  }

  setup(cleanup);
  teardown(cleanup);

  let subject, server;
  setup(async () => {
    server = await createStreamServer();
    subject = createOutbox({
      storagePath: FIXTURE_DIR
    });
    subject.queues.get('default-queue').concurrency = 20;
    subject.queues.get('default-queue').diskConcurrency = 20;
    subject.queues.get('default-queue').maxEntries = 5;
    subject.queues.get('default-queue').maxRetries = 6;
    subject.registerOperation(HttpOp);
    subject.registerOperation(NoBufferOp);
  });

  suite('with running queue', () => {

    test('online success', async () => {
      let handle = server.registerStream(1);
      await server.listen();

      let { stream, buffer } = randomStream();
      let op = new HttpOp({ arguments: handle.url });
      let finishedOp = eventToPromise(subject.queues.get('default-queue'), 'finished operation');

      await subject.addToQueue(op, stream);
      // ensure we emit the finished operation event...
      await finishedOp;

      assert.equal(handle.attempts.length, 1);
      assert.equal(handle.success, true);
      assert.equal(handle.content.toString(), buffer.toString());
    });

    test('offline then online (/w blobless)', async () => {
      let handle = server.registerStream(1);
      await server.listen();
      subject.online = false;
      subject.start(50);

      let args = { woot: true };
      let op = new NoBufferOp({ url: handle.url, args });
      let savedEvent = eventToPromise(subject.queues.get('default-queue'), 'saved operation');

      await subject.addToQueue(op);
      // ensure we emit the finished operation event...
      await savedEvent;

      let successEvent = eventToPromise(subject.queues.get('default-queue'), 'finished operation');
      subject.online = true;
      await successEvent;

      assert.equal(handle.attempts.length, 1);
      assert.equal(handle.success, true);
      let content = JSON.parse(handle.content.toString());
      assert.deepEqual(content, args);
    });

    test('offline then online', async () => {
      let handle = server.registerStream(1);
      await server.listen();
      subject.online = false;
      subject.start(50);

      let { stream, buffer } = randomStream();
      let op = new HttpOp({ arguments: handle.url });
      let savedEvent = eventToPromise(subject.queues.get('default-queue'), 'saved operation');

      await subject.addToQueue(op, stream);
      // ensure we emit the finished operation event...
      await savedEvent;

      let successEvent = eventToPromise(subject.queues.get('default-queue'), 'finished operation');
      subject.online = true;
      await successEvent;

      assert.equal(handle.attempts.length, 1);
      assert.equal(handle.success, true);
      assert.equal(handle.content.toString(), buffer.toString());
    });

    test('invalid metadata on disk', async () => {
      let handle = server.registerStream(1);
      await server.listen();
      subject.online = false;
      subject.start(50);

      let { stream } = randomStream();
      let op = new HttpOp({ arguments: handle.url });
      let savedEvent = eventToPromise(subject.queues.get('default-queue'), 'saved operation');

      await subject.addToQueue(op, stream);
      // ensure we emit the finished operation event...
      await savedEvent;

      let metadataPath = path.join(FIXTURE_DIR, 'default-queue/1/metadata.json');
      await fs.writeFile(metadataPath, 'blablanotjson');

      let removeEvent = eventToPromise(subject.queues.get('default-queue'), 'removed operation');
      subject.online = true;
      await removeEvent;

      assert.ok(!await fs.exists(metadataPath),
        'removed operation failed, file should not exist: ' + metadataPath);
    });

    test('shutdown with pending operations...', async () => {
      let liveOperations = 2;
      let offlineOperations = 3;

      await server.listen();
      subject.start(10);

      let pendingRequests = [];

      // Register "offline operations"
      subject.online = false;
      for (let i = 0; i < offlineOperations; i++) {
        let handle = server.registerStream(100 + i);
        handle.delay = 100; // wait 100ms before responding to request...

        let { stream } = randomStream();
        let op = new HttpOp({ arguments: handle.url });
        await subject.addToQueue(op, stream);
        pendingRequests.push(eventToPromise(handle, 'request'));
      }
      subject.online = true;

      // Register "live" operations which are pending...
      for (let i = 0; i < liveOperations; i++) {
        let handle = server.registerStream(200 + i);
        handle.delay = 100; // wait 100ms before responding to request...

        let { stream } = randomStream();
        let op = new HttpOp({ arguments: handle.url });
        // NOTE: This intentionally does not wait for anything to finish here...
        subject.addToQueue(op, stream);
        pendingRequests.push(eventToPromise(handle, 'request'));
      }

      await Promise.all(pendingRequests);

      assert.equal(subject.queues.get('default-queue').liveOperations.length, liveOperations);
      assert.ok(subject.queues.get('default-queue').running >= liveOperations + offlineOperations);
      await subject.shutdown();
      assert.equal(subject.queues.get('default-queue').running, 0);
      assert.equal(subject.queues.get('default-queue').liveOperations.length, 0);
    });

    test('recover from failure', async () => {
      // Ensure we are polling for retries.
      subject.start(50 /* poll every 50ms */);

      let handle = server.registerStream(1);

      let { stream, buffer } = randomStream();
      let op = new HttpOp({ arguments: handle.url });
      let failedOp = eventToPromise(subject.queues.get('default-queue'), 'saved operation');

      await subject.addToQueue(op, stream);
      // ensure we emit the finished operation event...
      let operationHandle = await failedOp;
      assert.equal(handle.success, false);

      // Wait for a number of retries...
      let retryAttempts = subject.queues.get('default-queue').maxRetries - 1;
      for (let retry = 0; retry < retryAttempts; retry++) {
        await eventToPromise(subject.queues.get('default-queue'), 'failed operation');
      }

      // Now turn on the server so the operation will be successful this time.
      let successOp = eventToPromise(subject.queues.get('default-queue'), 'finished operation');
      let removeOp = eventToPromise(subject.queues.get('default-queue'), 'removed operation');
      await server.listen();
      await successOp;
      let removeHandle = await removeOp;

      assert.ok(operationHandle.retries >= retryAttempts);
      assert.equal(handle.success, true);
      assert.equal(buffer.toString(), handle.content.toString());
      assert.ok(!(await fs.exists(removeHandle.path)), 'removes from disk');
      assert.equal(subject.queues.get('default-queue').running, 0);
    });

    test('max retries', async () => {
      // Ensure we are polling for retries.
      subject.start(50 /* poll every 50ms */);

      let handle = server.registerStream(1);

      let { stream } = randomStream();
      let op = new HttpOp({ arguments: handle.url });

      let saveOp = eventToPromise(subject.queues.get('default-queue'), 'saved operation');

      await subject.addToQueue(op, stream);
      let operationHandle = await saveOp;
      assert.equal(handle.success, false);

      assert.ok(await fs.exists(operationHandle.path), 'not on disk');

      // Wait for the max number of retries
      let retryAttempts = subject.queues.get('default-queue').maxRetries;
      for (let retry = 1; retry < retryAttempts; retry++) {
        await eventToPromise(subject.queues.get('default-queue'), 'failed operation');
      }

      // Queue should now give up
      await eventToPromise(subject.queues.get('default-queue'), 'giveup operation');
      await eventToPromise(subject.queues.get('default-queue'), 'removed operation');

      assert.ok(!(await fs.exists(operationHandle.path)), 'removes from disk');
      assert.equal(subject.queues.get('default-queue').running, 0);
    });

    test('max queue', async () => {
      await server.listen();
      subject.start(10);

      let pendingRequests = [];

      subject.online = false;

      // Overflow the queue looking for "removed operation" events
      let maxEntries = subject.queues.get('default-queue').maxEntries;
      for (let i = 0; i < maxEntries * 2; i++) {
        let handle = server.registerStream(100 + i);
        handle.delay = 100; // wait 100ms before responding to request...
        let args = { woot: true };
        let op = new NoBufferOp({ url: handle.url, args });

        let saveOp = eventToPromise(subject.queues.get('default-queue'), 'saved operation');
        let removeOp = eventToPromise(subject.queues.get('default-queue'), 'removed operation');

        await subject.addToQueue(op);
        pendingRequests.push(eventToPromise(handle, 'request'));

        if (i >= maxEntries) {
          await removeOp;
        }
        await saveOp;
      }
      await subject.shutdown();
    });


  });
});
