import assert from 'assert';

import eventToPromise from 'event-to-promise';
import createContext from 'silk-server/test/server/context';

import Connections from '../lib/connections';
import createApi from './api';
import skipOnTravis from './skip-on-travis';

suite('connections', () => {
  if (skipOnTravis()) {
    return;
  }
  // start a local server ...
  const context = createContext();

  // setup device to talk to the local server...
  setup(async () => {
    await createApi({ serverUrl: context.url });
  });

  test('.createCloudStream', async () => {
    const conn = new Connections();
    conn.start();
    await eventToPromise(conn, 'connect');

    const stream = conn.creatCloudStream('echo', {});
    const value = 'echo me foo!';
    stream.write(value);
    const result = await eventToPromise(stream, 'data');
    assert.equal(value, result);
  });

  suite('connect', () => {
    let subject;
    setup(() => {
      subject = new Connections();
    });

    test('initial successful connect', async () => {
      assert(!subject.connected);
      subject.start();
      await eventToPromise(subject, 'connect');
      assert(subject.connected);
    });

    test('reconnects', async () => {
      // connect to the server ...
      subject.start();
      await eventToPromise(subject, 'connect');

      let signaling = context.signaling;
      let attempt = 0;
      let tries = 3;

      do {
        attempt++;
        // Create a client which is signaling but has not yet completed.
        let reconnect = eventToPromise(subject, 'connect');
        // cause a forceful restart of the signaling server (will change it's
        // port).
        let pendingServer = signaling.restart();
        await reconnect;
        // Calling restart causes an entirely new server to be spun up so we
        // need to get a reference to it prior to running the next restart.
        signaling = await pendingServer;
      } while (attempt < tries);
    });
  });

});
