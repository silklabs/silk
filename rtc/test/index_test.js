/* @flow */
import assert from 'assert';
// ... make flow happy ...
import invariant from 'assert';
import { PassThrough, Duplex } from 'stream';
import eventToPromise from 'event-to-promise';

import { call, answer } from '../';

suite('WebRTC connections', () => {

  suite('setting up peer', () => {
    let caller, recipient;

    setup(async () => {
      const answerTransport = new Duplex({
        objectMode: true,
        read: () => {},
        write: (buffer, enc, callback) => {
          process.nextTick(() => {
            const json = JSON.parse(JSON.stringify(buffer));
            callerTransport.push(json);
            callback();
          });
        }
      });

      const callerTransport = new Duplex({
        objectMode: true,
        read: () => {},
        write: (buffer, enc, callback) => {
          process.nextTick(() => {
            const json = JSON.parse(JSON.stringify(buffer));
            answerTransport.push(json);
            callback();
          });
        }
      });

      // initiate the caller ...
      caller = call({
        dataChannels: {
          'default': {},
        },
      });

      let answerPending = answer(answerTransport);
      // Initiate the call ... This will send some information to the transport.
      let callPending = caller.peer(callerTransport);
      await callPending;
      recipient = await answerPending;
    });

    teardown(() => {
      caller.close();
      recipient.close();
    });

    test('force close recipient', async () => {
      let channel = caller.channel('default');
      let closePromise = eventToPromise(caller, 'close');
      recipient.close();
      await closePromise;
    });

    test('force close caller', async () => {
      let closePromise = eventToPromise(recipient, 'close');
      caller.close();
      await closePromise;
    });

    test('data channel ping/pong', async () => {
      let callerChannel = caller.channel('default');
      let recipientChannel = recipient.channel('default');
      invariant(callerChannel);
      invariant(recipientChannel);

      callerChannel.emit('foo', {
        woot: true,
        binary: new Buffer('foo'),
      });

      let recipientMsg = await eventToPromise(recipientChannel, 'foo');
      assert.equal(recipientMsg.woot, true);
      assert.ok(Buffer.isBuffer(recipientMsg.binary));
      assert.equal(recipientMsg.binary.toString(), 'foo');

      recipientChannel.emit('foobar', {
        woot: true,
      });
      let callerMsg = await eventToPromise(callerChannel, 'foobar');
      assert.equal(callerMsg.woot, true);
    });

    test('data channel close on recipient end', async () => {
      let callerChannel = caller.channel('default');
      let recipientChannel = recipient.channel('default');

      recipientChannel.close();
      await eventToPromise(callerChannel, 'close');
    });

    test('data channel close on recipient end (entire connection)', async () => {
      let callerChannel = caller.channel('default');

      recipient.close();
      await eventToPromise(callerChannel, 'close');
    });

    test('data channel close on caller end', async () => {
      let callerChannel = caller.channel('default');
      let recipientChannel = recipient.channel('default');
      invariant(callerChannel);
      invariant(recipientChannel);

      callerChannel.close();
      await eventToPromise(recipientChannel, 'close');
    });

    test('data channel close on caller end (entire connection)', async () => {
      let recipientChannel = recipient.channel('default');

      caller.close();
      await eventToPromise(recipientChannel, 'close');
    });
  });

});
