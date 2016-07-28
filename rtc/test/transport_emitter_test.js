/**
 * @flow
 */

import TransportEmitter from '../src/transport_emitter';

import { PassThrough } from 'stream';
import eventToPromise from 'event-to-promise';
import assert from 'assert';

suite('transport emitter', function() {


  let transport, subject;
  setup(() => {
    transport = new PassThrough({ objectMode: true });
    subject = new TransportEmitter(transport);
  });

  test('simple read/write', async () => {
    const event = eventToPromise(subject, 'foo');
    const payload = { foo: true };
    transport.write(['foo', payload]);

    const result = await event;
    assert(result === payload);

    const incoming = eventToPromise(transport, 'data');
    subject.emit('test', true);

    const incomingResult = await incoming;
    assert.deepEqual(incomingResult, ['test', true]);

    const end = eventToPromise(subject, 'end');
    transport.end();
    await end;
  });


  test('buffering emits', async () => {
    let gotStuff = false;
    subject.holdIncomingEvent('stuff');
    subject.on('stuff', () => {
      gotStuff = true;
    });
    await new Promise((accept) => {
      transport.write(['stuff', true], accept);
    });

    assert(!gotStuff);
    assert(subject.releaseIncomingEvent('stuff') === 1);
    assert(gotStuff);
  });

});
