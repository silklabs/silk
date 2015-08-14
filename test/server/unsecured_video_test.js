/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import createContext from './context';
import eventToPromise from 'event-to-promise';
import { EventEmitter } from 'events';
import createSocketIO from 'socket.io-client';

suite('unsecured video', () => {
  let context = createContext();

  function consumeEvents(emitter, event, count = 1) {
    // XXX: This never will error out so is only safe in test enviornment
    // where we have implicit timeouts.
    return new Promise((accept) => {
      let remaining = count;
      let messages = [];
      function handler(msg) {
        messages.push(msg);
        if (--remaining === 0) {
          emitter.removeListener(event);
          accept(messages);
        }
      }
      emitter.on(event, handler);
    });
  }

  function assertSameBuffer(b1, b2) {
    assert.equal(b1.length, b2.length);
    for (let i = 0; i < b1.length; ++i) {
      assert.equal(b1[i], b2[i]);
    }
  }

  async function connectStream(emitter, socket, device, name) {
    socket.emit('info', { id: device, now: Date.now(), name: name, logo: [] });
    socket.emit('video', { id: device });
    let msg = await eventToPromise(emitter, 'new');
    assert.equal(msg.id, device);
    assert.equal(msg.name, name);
  }

  async function receiveBufferFrom(socket, device, name) {
    let frame = new Buffer([0, 1, 2, 3, 4]);
    socket.emit('join', 'video-' + device);
    socket.emit('video', { id: device, name: name, frame: frame });

    let msg = await eventToPromise(socket, `video-${device}`);
    assert.equal(msg.id, device);
    assert.equal(msg.name, name);
    assertSameBuffer(msg.frame, frame);
  }

  let socket, videoEvents;
  setup(async () => {
    videoEvents = new EventEmitter();
    socket = createSocketIO(context.url, {
      transports: ['websocket']
    });

    // Ensure we are connected to socket first...
    await eventToPromise(socket, 'connect');
    socket.on('video-stream-new', (msg) => {
      videoEvents.emit('new', msg);
    });
    socket.emit('join', 'video-streams');
  });

  test('room echoing /w interleaved communication', async () => {
    await connectStream(videoEvents, socket, 'test1', 'Test Name');
    await receiveBufferFrom(socket, 'test1', 'Test Name');
    await connectStream(videoEvents, socket, 'test2', 'Test 2 Name');
    await receiveBufferFrom(socket, 'test2', 'Test 2 Name');
    await receiveBufferFrom(socket, 'test1', 'Test Name');

    // validate the set of rooms...
    let rooms = ['test1', 'test2'];
    let newSocket = createSocketIO(context.url, {
      transports: ['websocket']
    });

    newSocket.emit('join', 'video-streams');
    let messages = await consumeEvents(newSocket, 'video-stream-new', 2);
    let gotRooms = messages.map((msg) => {
      return msg.id;
    });
    assert.deepEqual(rooms, gotRooms);
    newSocket.close();
  });
});
