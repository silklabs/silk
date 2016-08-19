import assert from 'assert';
import WebSocket from 'ws';
import eventToPromise from 'event-to-promise';
import SasCompositeTable from 'silk-azure-storage/src/sas_composite_table';

import {MultiplexStream, WebSocketDuplexStream} from 'silk-streams';

import createContext from '../server/context';

suite('connect test', () => {
  const context = createContext({
    signaling: {
      clients: {
        timeoutMs: 3 * 1000,
      },

      residents: {
        checkIntervalMs: 100,
        pingIntervalMs: 50,
        pongTimeoutMs: 1000,
      },
    },
  });

  let device, account, serversTable;
  setup(async () => {
    const pair = await context.testPair();
    device = pair.device;
    account = pair.account;

    serversTable = new SasCompositeTable(async () => {
      let { sas } = await device.api.device.getSasForSignaling();
      return sas;
    });
  });

  test('connect as device', async () => {
    let servers = await serversTable.query();
    assert.equal(servers.length, 1);
    const url = await device.api.genSignSignalingUrl('device', servers[0].host);
    let ws = new WebSocket(url);
    await eventToPromise(ws, 'open');

    let deviceLocations = await serversTable.query({
      PartitionKey: device.record.accountId,
    });

    assert.equal(deviceLocations.length, 1);
    let expectedHost = `http://localhost:${context.signaling.port}`;
    assert.equal(deviceLocations[0].host, expectedHost);
  });

  test('connect as account', async () => {
    let servers = await serversTable.query();
    assert.equal(servers.length, 1);

    const deviceUrl =
      await device.api.genSignSignalingUrl('device', servers[0].host);
    let deviceWs = new WebSocket(deviceUrl);
    let deviceWsDuplex = new WebSocketDuplexStream(deviceWs);
    let deviceMux = new MultiplexStream(deviceWsDuplex);
    await eventToPromise(deviceWs, 'open');

    const accountUrl = await account.api.genSignSignalingUrl(
      'account',
      servers[0].host,
      {deviceId: device.record.accessToken.publicKey}
    );
    let accountWs = new WebSocketDuplexStream(new WebSocket(accountUrl));
    accountWs.write('ping');

    const accountPeer = await eventToPromise(deviceMux, 'data');
    const ping = await eventToPromise(accountPeer, 'data');
    assert.equal(ping.toString(), 'ping');

    accountPeer.end('pong');
    let pong = await eventToPromise(accountWs, 'data');
    assert.equal(pong.toString(), 'pong');
    accountWs.end();
    accountPeer.end();

    await Promise.all([
      eventToPromise(accountWs, 'close'),
      eventToPromise(accountPeer, 'close'),
    ]);
  });

  test('ping / pong - gets ping', async function() {
    this.timeout('10s');
    let servers = await serversTable.query();
    assert.equal(servers.length, 1);
    const deviceUrl =
      await device.api.genSignSignalingUrl('device', servers[0].host);
    let deviceWs = new WebSocket(deviceUrl);
    await eventToPromise(deviceWs, 'ping');
  });

  test('terminate accounts on device disconnect', async () => {
    let servers = await serversTable.query();
    assert.equal(servers.length, 1);

    const deviceUrl =
      await device.api.genSignSignalingUrl('device', servers[0].host);
    let deviceWs = new WebSocket(deviceUrl);
    await eventToPromise(deviceWs, 'open');

    const accountUrl = await account.api.genSignSignalingUrl(
      'account',
      servers[0].host,
      {deviceId: device.record.accessToken.publicKey}
    );
    let accountWs = new WebSocket(accountUrl);
    await eventToPromise(accountWs, 'open');
    deviceWs.close();

    await eventToPromise(accountWs, 'close');
  });

  test('account idles too long', async function() {
    this.timeout('10s');
    let servers = await serversTable.query();
    assert.equal(servers.length, 1);

    const deviceUrl =
      await device.api.genSignSignalingUrl('device', servers[0].host);
    let deviceWs = new WebSocket(deviceUrl);
    await eventToPromise(deviceWs, 'open');

    const accountUrl = await account.api.genSignSignalingUrl(
      'account',
      servers[0].host,
      {deviceId: device.record.accessToken.publicKey}
    );
    let accountWs = new WebSocket(accountUrl);
    await eventToPromise(accountWs, 'open');

    await eventToPromise(accountWs, 'close');
  });

  test('terminate resident for missing pongs', async function () {
    this.timeout('10s');
    let servers = await serversTable.query();
    assert.equal(servers.length, 1);
    const deviceUrl =
      await device.api.genSignSignalingUrl('device', servers[0].host);
    let deviceWs = new WebSocket(deviceUrl);
    let pongAttempts = 0;
    // We override the ws implementation of pong so the server never
    // sees the pong ....
    const originalPong = deviceWs.pong;
    deviceWs.pong = (...args) => {
      if (++pongAttempts < 2) {
        // Send a few pongs to simulate a client which dies ...
        originalPong.call(deviceWs, ...args);
      }
    };
    await eventToPromise(deviceWs, 'close');
    assert(pongAttempts > 0);
  });

  test('server entity delete', async () => {
    let servers = await serversTable.query();
    assert.equal(servers.length, 1);
    await context.signaling.close();

    servers = await serversTable.query();
    assert.equal(servers.length, 0);
  });
});
