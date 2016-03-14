import assert from 'assert';
import { Duplex, PassThrough } from 'stream';

import eventToPromise from 'event-to-promise';

import demux from '../src/demux';

suite('demuxing stream', () => {

  function header(id, type = 0) {
    return Buffer.concat([
      new Buffer([type]),
      new Buffer(id)
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


  test('2 streams', async () => {
    // helper for data event to string.
    // Backing data source mimicing the other end of lets say a WebSocket.
    const backing = new PassThrough();

    const source = new Duplex({
      // No op we manually push below ...
      read: () => {},
      write: (...args) => {
        backing.write(...args);
      }
    });
    const multi = demux(source);

    const streamPending = eventToPromise(multi, 'data');
    source.push(header('1'));
    source.push(new Buffer('foobarz'));

    const stream = await streamPending;
    assert.equal(await d(stream), 'foobarz');

    source.push(header('1'));
    source.push(new Buffer('wut'));
    assert.equal(await d(stream), 'wut');

    const pendingSecondStream = eventToPromise(multi, 'data');
    source.push(header('2222'));
    source.push(new Buffer('number2'));
    const secondStream = await pendingSecondStream;
    assert.equal(await d(secondStream), 'number2');

    // Writes on streams are sent back to source...
    let secondDone = Promise.all([
      eventToPromise(secondStream, 'finish'),
      eventToPromise(secondStream, 'close'),
    ]);
    secondStream.end('fuxors')
    source.push(header('2222', 1)); // close frame.
    assert.equal(await d(backing), '2222');
    assert.equal(await d(backing), 'fuxors');
    await secondDone;
    assert.ok(!multi.hasStream(new Buffer('2222').toString('hex')));
  });

});
