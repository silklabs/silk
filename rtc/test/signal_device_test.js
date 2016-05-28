import assert from 'assert';
import crypto from 'crypto';
import eventToPromise from 'event-to-promise';
import deviceApi from 'silk-device-core/lib/api';
import Connections from 'silk-device-core/lib/connections';
import createContext from 'silk-server/test/server/context';
import sha256 from 'silk-utils/sha256';

import signalDevice from '../src/signal_device';

suite('signal device', function() {
  const context = createContext();

  let account, device, connections;
  setup(async () => {
    const pair = await context.testPair();
    account = pair.account;
    device = pair.device;

    deviceApi.accessToken = device.accessToken;
    deviceApi.loadConfig({
      serverUrl: context.url,
    });

    connections = new Connections();
    connections.start();
    await eventToPromise(connections, 'connect');
  });

  async function connect() {
    let devicePeer = signalDevice(
      account.api,
      device.accessToken.toString(),
      {
        dataChannels: {
          video: {},
        },
      }
    );

    let [connection] = await Promise.all([
      eventToPromise(connections, 'connection'),
      eventToPromise(devicePeer, 'connect'),
    ]);

    return [devicePeer, connection];
  }

  test('signal device', async () => {
    await connect();
  });

  test('oversized writes', async () => {
    const BUFFER_SIZE = 141346;

    const large = crypto.randomBytes(BUFFER_SIZE);
    // const large = new Buffer([3, 8, 10, 11]);
    const binary = crypto.randomBytes(BUFFER_SIZE);
    const expectedLarge = sha256(large);
    const expectedBinary = sha256(binary);

    const [devicePeer, device] = await connect();

    devicePeer.channel('video').emit('data', {
      string: 'woot',
      number: 1,
      large,
      binary,
    });

    const payload = await eventToPromise(
      device.channel('video'),
      'data'
    );

    assert.equal(payload.string, 'woot');
    assert.equal(payload.number, '1');
    assert.equal(sha256(new Buffer(payload.large)), expectedLarge);
    assert.equal(sha256(new Buffer(payload.binary)), expectedBinary);
  });

  test('buffered writes', async () => {
    const devicePeer = signalDevice(
      account.api,
      device.accessToken.toString(),
      {
        dataChannels: {
          video: {},
        },
      }
    );

    devicePeer.channel('video').emit('data', ['foobar']);

    const [conn] = await Promise.all([
      eventToPromise(connections, 'connection'),
      eventToPromise(devicePeer, 'connect'),
    ]);

    let video = conn.channel('video');
    let data = await eventToPromise(video, 'data');
    assert.deepEqual(data, ['foobar']);
  });

  test('reconnect', async function() {
    // webrtc can take a long time to signal disconnects on both ends.
    this.timeout('50s');
    const [devicePeer] = await connect();

    const reconnects = 2;
    let attempt = 0;

    do {
      connections.stop();
      await eventToPromise(devicePeer, 'disconnect');
      connections.start();
      await eventToPromise(devicePeer, 'connect');
      attempt++;
    } while(attempt < reconnects);
  });

});
