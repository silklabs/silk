/**
 * @flow
 */

import assert from 'assert';
import http from 'http';

import eventToPromise from 'event-to-promise';
import {
  default as WebSocket,
  Server as WebSocketServer,
} from 'ws';

import WebSocketDuplex from '../src/websocket';
import { MessagePackDuplexStream } from '../src/msgpack';
import drain from '../src/drain';

suite('websocket', () => {

  let wss, server, url;
  setup(() => {
    server = http.createServer();
    wss = new WebSocketServer({ server });
    server.listen(0);
    eventToPromise(server, 'listen');

    url = `http://localhost:${server.address().port}`;
  });

  test('basic websocket operations', async () => {
    const clientRaw = new WebSocketDuplex(new WebSocket(url));
    const serverClientRaw = new WebSocketDuplex(await eventToPromise(wss, 'connection'));

    // We wrap the lower level stream in this higher one to test that we can
    // successfully pipe/stream data.
    const client = new MessagePackDuplexStream(clientRaw);
    const serverClient = new MessagePackDuplexStream(serverClientRaw);

    // Write some data from the client side and wait until it is "finished".
    client.end('foo bar');
    await eventToPromise(client, 'finish');
    assert.equal(clientRaw.readyState, WebSocket.CLOSING);

    // Now we write some data on the server side to ensure the client gets it
    // even though its "closing".
    serverClient.end('qux');

    const closes = Promise.all([
      eventToPromise(client, 'end'),
      eventToPromise(serverClient, 'end'),
      eventToPromise(client, 'close'),
      eventToPromise(serverClient, 'close'),
    ]);

    let [clientOut, serverOut] = (await Promise.all([
      drain(client),
      drain(serverClient),
    ])).map((buffers) => {
      // We only sent one frame ...
      return buffers[0];
    });

    assert.equal(serverOut, 'foo bar');
    assert.equal(clientOut, 'qux');

    await closes;
  });

});
