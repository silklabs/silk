import assert from 'assert';

import eventToPromise from 'event-to-promise';
import createContext from 'silk-server/test/server/context';
import { call } from 'silk-rtc';
import SasCompositeClient from 'silk-azure-storage/src/sas_composite_table';
import WebSocket from 'ws';

import WebSocketDuplex from 'silk-streams/src/websocket';
import { MessagePackDuplexStream } from 'silk-streams/src/msgpack';

import Connections from '../lib/connections';
import createApi from './api';

suite('connections', () => {
  // start a local server ...
  const context = createContext();

  async function connectAccount() {
    const { accountId } = await accountApi.account.whoami();
    const devicesTable = new SasCompositeClient(async () => {
      const { sas } = await accountApi.account.getSasForDeviceSignaling();
      return sas;
    });

    const devices = await devicesTable.query({
      PartitionKey: accountId,
      RowKey: deviceApi.accessToken.toString(),
    });

    assert(devices.length, 1);
    assert(devices[0].host);

    const url = accountApi.signSignalingUrl('account', devices[0].host, {
      deviceId: deviceApi.accessToken.toString()
    });

    const ws = new WebSocket(url);
    await eventToPromise(ws, 'open');
    return ws;
  }

  let deviceApi, accountApi;
  setup(async () => {
    const apis = await createApi({ serverUrl: context.url });
    deviceApi = apis.device;
    accountApi = apis.account;
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
      } while(attempt < tries);
    });

    test('single webrtc connection', async () => {
      subject.start();
      await eventToPromise(subject, 'connect');

      const ws = await connectAccount();
      const duplex = new WebSocketDuplex(ws);
      const emitter = new MessagePackDuplexStream(duplex);

      const caller = call({
        dataChannels: {
          'video': {},
          'preview': {},
        }
      });

      await caller.peer(emitter);
    });

  });

});
