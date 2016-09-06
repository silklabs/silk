/**
 * @flow
 */

import assert from 'assert';
import invariant from 'assert';
import eventToPromise from 'event-to-promise';
import Blob from 'node-webrtc/lib/blob';
import deviceApi from 'silk-device-api';
import Connections from 'silk-device-core/lib/connections';
import createContext from 'silk-server/test/server/context';
import assertAsyncThrows from 'silk-utils/assert_async_throws';
import crypto from 'crypto';
import sha256 from 'silk-utils/sha256';

import { call } from 'silk-rtc';

// Inject Blob into global scope.
global.Blob = Blob;

suite('silk-rtc', function() {
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

    // We simply use our reference implementation here to more closely test reality.
    connections = new Connections('disable permissions');
    connections.start();
    await eventToPromise(connections, 'connect');
  });


  function createPeer() {
    return call(account.api, device.accessToken.toString());
  }

  async function connect() {
    const peer = createPeer();

    const [devicePeer] = await Promise.all([
      eventToPromise(connections, 'connection'),
      peer.connect(),
    ]);

    return [peer, devicePeer];
  }

  test('data channel connect', async () => {
    const [peer, devicePeer] = await connect();
    const deviceVideoChannelPromise = eventToPromise(devicePeer, 'datachannel');

    const videoChannel = peer.createChannel('video');
    const deviceVideoChannel = await deviceVideoChannelPromise;

    videoChannel.emit('foo');
    await eventToPromise(deviceVideoChannel, 'foo');
    assert(devicePeer.getChannel('video'));
  });

  test('.requestLocalMediaStream', async () => {
    const peer = createPeer();
    const media = await peer.requestLocalMediaStream({
      video: false,
      audio: false,
    });
    assert(media);

    // TODO: It's very difficult to test this here since we do not get access to
    // raw data and we are never sure if we have a audio/video backend.
  });

  test('emits close event when peer closes', async function () {
    // Sadly this takes a long time ...
    this.timeout('40s');
    const [peer, devicePeer] = await connect();
    devicePeer.destroy();
    const {reason} = await eventToPromise(peer, 'close');
    assert.equal(reason, 'failed');
  });

  suite('.requestRemoteMediaStream', () => {
    test('remote side not handling requests...', async () => {
      const [peer, devicePeer] = await connect();
      devicePeer.setMediaRequestHandler(null);
      await assertAsyncThrows(async () => {
        await peer.requestRemoteMediaStream('preview', {
          audio: false,
          video: true,
        });
      }, new RegExp(/media/));
    });

    test('successfully request stream', async () => {
      const [peer, devicePeer] = await connect();
      devicePeer.setMediaRequestHandler(async (label, constraints) => {
        return devicePeer.requestLocalMediaStream(constraints);
      });

      const addStreamEventPromise = eventToPromise(peer, 'addstream');

      const media = await peer.requestRemoteMediaStream('preview', {
        audio: false,
        video: true,
      });
      const addStreamEvent = await addStreamEventPromise;
      assert.equal(addStreamEvent.label, 'preview');

      const peerStreams = peer.getMediaStreams();
      const devicePeerStreams = peer.getMediaStreams();
      assert(peerStreams.has('preview'));
      assert(devicePeerStreams.has('preview'));
      const preview = peerStreams.get('preview');
      invariant(preview);
      const previewStream = preview.stream;
      invariant(previewStream);
      assert(previewStream === media);
      assert(previewStream.id);

      peer.removeStream('preview');
      const removeStreamEvent = await eventToPromise(peer, 'removestream');
      assert.equal(removeStreamEvent.label, 'preview');

      assert(!peer.getMediaStream('preview'));
      assert(!devicePeer.getMediaStream('preview'));
    });

    test('request multiple streams', async () => {
      const [peer, devicePeer] = await connect();
      devicePeer.setMediaRequestHandler(async (label, constraints) => {
        return devicePeer.requestLocalMediaStream(constraints);
      });

      await Promise.all([
        peer.requestRemoteMediaStream('p1', {
          audio: false,
          video: {
            mandatory: {
              minFrameRate: 1,
              maxFrameRate: 1,
            },
          },
        }),
        peer.requestRemoteMediaStream('p2', {
          audio: false,
          video: {
            mandatory: {
              minFrameRate: 1,
              maxFrameRate: 1,
            },
          },
        }),
        peer.requestRemoteMediaStream('p3', {
          audio: false,
          video: {
            mandatory: {
              minFrameRate: 30,
              maxFrameRate: 30,
            },
          },
        }),
      ]);

      const streams = peer.getMediaStreams();
      assert(streams.has('p1'));
      assert(streams.has('p2'));
      assert(streams.has('p3'));

      // peer.removeStream('p2');
      // await eventToPromise(peer, 'removestream');
    });
  });

  test('oversized writes', async () => {
    const BUFFER_SIZE = 141346;

    const large = crypto.randomBytes(BUFFER_SIZE);
    const binary = crypto.randomBytes(BUFFER_SIZE);
    const expectedLarge = sha256(large);
    const expectedBinary = sha256(binary);

    const [devicePeer, device] = await connect();

    const devicePeerChannel = devicePeer.createChannel('video');
    const deviceChannel = await eventToPromise(device, 'datachannel');

    devicePeerChannel.emit('data', {
      string: 'woot',
      number: 1,
      large,
      binary,
    });

    const payload = await eventToPromise(
      deviceChannel,
      'data'
    );

    assert.equal(payload.string, 'woot');
    assert.equal(payload.number, '1');
    assert(payload.large instanceof Blob);
    assert(payload.binary instanceof Blob);
    assert.equal(sha256(payload.large.buffer), expectedLarge);
    assert.equal(sha256(payload.binary.buffer), expectedBinary);
  });

});
