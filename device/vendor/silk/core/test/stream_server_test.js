/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import createStreamServer from './stream_server';
import eventToPromise from 'event-to-promise';
import assert from 'assert';
import httpStream from '../lib/streams/http';
import randomStream from './random_stream';
import streams from 'stream';

suite('stream server', () => {

  let server;
  setup(async () => {
    server = await createStreamServer();
    await server.listen();
  });

  test('success', async () => {
    let handle = server.registerStream(1);
    let { buffer, stream } = randomStream();

    let writable = httpStream(handle.url, { method: 'post' });
    let close = eventToPromise(writable, 'close');
    stream.pipe(writable);

    await close;
    assert.equal(handle.attempts.length, 1);
    assert.ok(handle.success);
    assert.equal(handle.content.toString(), buffer.toString());
  });

  test('force abort', async () => {
    let handle = server.registerStream(1);
    handle.forceAbort = true;

    let { stream } = randomStream();
    let writable = httpStream(handle.url, { method: 'post' });
    let close = eventToPromise(writable, 'close');
    stream.pipe(writable);

    try {
      await close;
    } catch (err) {
      assert.equal(err.code, 'ECONNRESET');
      assert.ok(!handle.success);
      return;
    }
  });

  test('server close during write', async () => {
    let handle = server.registerStream(1);

    let readable = new streams.PassThrough();
    let writable = httpStream(handle.url, { method: 'post' });
    let close = eventToPromise(writable, 'close');

    readable.pipe(writable);
    readable.write('lala', async () => {
      await server.close();
      readable.end();
    });

    try {
      await close;
    } catch (err) {
      assert.equal(err.code, 'ECONNREFUSED');
      assert.ok(!handle.success);
      return;
    }
  });

});
