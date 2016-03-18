import assert from 'assert';
import http from 'http';

import eventToPromise from 'event-to-promise';
import {
  default as WebSocket,
  Server as WebSocketServer,
} from 'ws';

import WebSocketDuplex from '../src/websocket';
import Demux from '../src/demux';

suite('demuxing stream', () => {

  function header(id, type = 0) {
    return Buffer.concat([
      new Buffer([type]),
      new Buffer(id),
    ]);
  }

  function d(stream) {
    let read = stream.read();
    if (read) {
      return Promise.resolve(read);
    }

    return eventToPromise(stream, 'data').then((v) => {
      return v.toString();
    });
  }

  let wss, server, url, source, backing;
  setup(async () => {
    server = http.createServer();
    wss = new WebSocketServer({ server });
    server.listen(0);
    eventToPromise(server, 'listen');

    url = `http://localhost:${server.address().port}`;

    source = new WebSocketDuplex(new WebSocket(url));

    const serverConnection = await eventToPromise(wss, 'connection');
    backing = new WebSocketDuplex(serverConnection);
  });

  teardown(() => {
    server.close();
  });

  test('2 streams', async () => {
    const demux = new Demux(source);
    source.pipe(demux);

    const streamPending = eventToPromise(demux, 'data');
    backing.write(header('1'));
    backing.write(new Buffer('foobarz'));

    const stream = await streamPending;
    assert.equal(await d(stream), 'foobarz');

    backing.write(header('1'));
    backing.write(new Buffer('wut'));
    assert.equal(await d(stream), 'wut');

    // second stream intentionally never writes.
    const pendingSecondStream = eventToPromise(demux, 'data');
    backing.write(header('2222'));
    backing.write(new Buffer('number2'));
    const secondStream = await pendingSecondStream;
    assert.equal(await d(secondStream), 'number2');

    // Writes on streams are sent back to source...
    let secondDone = Promise.all([
      eventToPromise(secondStream, 'finish'),
      eventToPromise(secondStream, 'close'),
    ]);
    secondStream.end('fuxors');
    backing.write(header('2222', 1)); // close frame.
    assert.equal(await d(backing), '2222');
    assert.equal(await d(backing), 'fuxors');
    await secondDone;
    assert.ok(!demux.hasStream(new Buffer('2222').toString('hex')));

    backing.write(header('1', 1)); // close frame.
    stream.end();

    await Promise.all([
      eventToPromise(stream, 'end'),
      eventToPromise(stream, 'close'),
    ]);
  });

});
