import assert from 'assert';
import http from 'http';
import drain from '../src/drain';

import eventToPromise from 'event-to-promise';
import {
  default as WebSocket,
  Server as WebSocketServer,
} from 'ws';

import WebSocketDuplexStream from '../src/websocket';
import DemuxStream from '../src/demux';

suite('demuxing stream', () => {
  let wss, server, url, source, backing;
  setup(async () => {
    server = http.createServer();
    wss = new WebSocketServer({ server });
    server.listen(0);
    eventToPromise(server, 'listen');

    url = `http://localhost:${server.address().port}`;

    source = new WebSocketDuplexStream(new WebSocket(url));

    const serverConnection = await eventToPromise(wss, 'connection');
    backing = new WebSocketDuplexStream(serverConnection);
  });

  teardown(() => {
    server.close();
  });

  test('bi-direction stream creation', async () => {
    const muxOne = new DemuxStream(source);
    const muxTwo = new DemuxStream(backing);

    const stream = muxOne.createStream({
      type: 'foobar',
    }, 'local');
    const newStream = await eventToPromise(muxTwo, 'data');
    newStream.name = 'remote';
    assert.deepEqual(newStream.body, { type: 'foobar' });

    stream.write('bla');
    const data = await eventToPromise(newStream, 'data');
    assert.equal(data.toString(), 'bla');
  });

  test('underlying stream close', async () => {
    const muxOne = new DemuxStream(source, 'muxOne');
    const muxTwo = new DemuxStream(backing, 'muxTwo');
    const local = muxOne.createStream();
    const remote = await eventToPromise(muxTwo, 'data');

    // we are not going to read from remote but ensure
    // it is flowing data ...
    remote.resume();

    const write = '...';
    remote.write(write);
    const read = await eventToPromise(local, 'data');
    assert.equal(write, read.toString());

    // close and wait for both sides to emit errors ...
    source.close();
    await Promise.all([
      // mux must close ...
      eventToPromise(muxOne, 'error'),
      eventToPromise(muxTwo, 'error'),

      // both streams must close ...
      eventToPromise(local, 'error'),
      eventToPromise(remote, 'error'),

      // streams must end and finish ...
      eventToPromise(local, 'finish', { ignoreErrors: true }),
      eventToPromise(remote, 'finish', { ignoreErrors: true }),
      eventToPromise(local, 'end', { ignoreErrors: true }),
      eventToPromise(remote, 'end', { ignoreErrors: true }),
    ]);

  });

  test('gracefully close', async () => {
    const muxOne = new DemuxStream(source, 'muxOne');
    const muxTwo = new DemuxStream(backing, 'muxTwo');
    const local = muxOne.createStream();
    const remote = await eventToPromise(muxTwo, 'data');
    const cleanlyCloses = Promise.all([
      eventToPromise(local, 'close'),
      eventToPromise(remote, 'close'),
    ]);

    assert.equal(muxOne.streamCount(), 1);
    assert.equal(muxTwo.streamCount(), 1);

    // finish up all the writes ...
    local.write('foo');
    local.write('bar');
    local.write('baz');
    local.end();

    // drain will wait for .end ...
    const localData = await drain(remote);
    assert.deepEqual(
      localData.map(buffer => buffer.toString()),
      ['foo', 'bar', 'baz'],
     );

    remote.end('foo');
    const remoteData = await drain(local);
    assert.deepEqual(
     remoteData.map(buffer => buffer.toString()),
     ['foo']
    );

    // cleanly closes ...
    await cleanlyCloses;
    assert.equal(muxOne.streamCount(), 0);
    assert.equal(muxTwo.streamCount(), 0);
  });

  test('force close from one side ...', async () => {
    const muxOne = new DemuxStream(source, 'muxOne');
    const muxTwo = new DemuxStream(backing, 'muxTwo');
    const local = muxOne.createStream();
    const remote = await eventToPromise(muxTwo, 'data');

    local.write('...');
    local.destroy();
    assert.equal(muxOne.streamCount(), 0);
    assert.equal(muxTwo.streamCount(), 1);

    await Promise.all([
      eventToPromise(remote, 'error'),
      eventToPromise(remote, 'close', { ignoreErrors: true }),
    ]);
    assert.equal(muxTwo.streamCount(), 0);
  });
});
