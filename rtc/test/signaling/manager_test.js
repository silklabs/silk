/**
 * @flow
 */

import assert from 'assert';
import eventToPromise from 'event-to-promise';
import deviceApi from 'silk-device-api';
import Connections from 'silk-device-core/lib/connections';
import createContext from 'silk-server/test/server/context';
import skipOnTravis from 'silk-utils/skip_on_travis';

import SignalServer from '../../src/signaling/call_manager';
import * as WebRTC from '../../src/webrtc';

suite('Call / Answer manager', function() {
  const context = createContext();

  let account, device, connections, subject;
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

    subject = new SignalServer(
      account.api,
      device.accessToken.toString()
    );
  });

  test('._getStream', async () => {
    const stream = await subject._getStream();

    stream.write('boo!');
    const deviceStream = await eventToPromise(connections, 'request');
    const data = await eventToPromise(deviceStream, 'data');
    // Added quotes since otherside is reading as json ...
    assert.equal(data.toString(), '"boo!"');
  });

  suite('.signal', function() {

    function getPC() {
      // TODO: Use local STUN server ...
      return new WebRTC.RTCPeerConnection();
    }

    // XXX: We need this to workaround state races in the webrtc stack. In between
    // the offer/answer states and stable changing the sdp can cause errors.
    async function waitForStable(pc) {
      while (pc.signalingState !== 'stable') {
        const state = pc.signalingState;
        if (state === 'stable') {
          return;
        }
        await eventToPromise(pc, 'signalingstatechange');
      }
    }

    async function connect() {
      const pendingDevicePc = eventToPromise(connections, 'connection');
      const pc = getPC();
      await subject.signal(pc);
      const devicePc = await pendingDevicePc;
      return [
        pc,
        // XXX: This is a sorta nasty hack but what we really want is the underlying
        // RTCPeerConnection.
        devicePc._peerConnection,
      ];
    }

    skipOnTravis(test, 'connect -> recipient adds stream', async () => {
      const [pc, devicePc] = await connect();
      const stream = await new Promise((accept, reject) => {
        WebRTC.getUserMedia({ video: true }, accept, reject);
      });
      devicePc.addStream(stream);
      await eventToPromise(pc, 'addstream');

      await Promise.all([
        waitForStable(pc),
        waitForStable(devicePc),
      ]);
    });

    skipOnTravis(test, 'connect -> recipient adds stream -> recipient removes stream', async () => {
      const [pc, devicePc] = await connect();
      const stream = await new Promise((accept, reject) => {
        WebRTC.getUserMedia({ video: true }, accept, reject);
      });
      devicePc.addStream(stream);
      const peerStreamEvent = await eventToPromise(pc, 'addstream');

      await Promise.all([
        waitForStable(pc),
        waitForStable(devicePc),
      ]);

      // For removestream to actually fire we must empty out all tracks first!
      const tracks = stream.getTracks();
      for (let track of tracks) {
        stream.removeTrack(track);
      }

      devicePc.removeStream(peerStreamEvent.stream);
      await eventToPromise(pc, 'removestream');
    });

    skipOnTravis(test, 'connect -> caller adds stream -> destroy', async () => {
      const [pc, devicePc] = await connect();
      const stream = await new Promise((accept, reject) => {
        WebRTC.getUserMedia({ video: true }, accept, reject);
      });
      pc.addStream(stream);
      await eventToPromise(devicePc, 'addstream');

      await Promise.all([
        waitForStable(pc),
        waitForStable(devicePc),
      ]);

      subject.destroy();
      await eventToPromise(pc, 'signalingstatechange');
      assert.equal(pc.signalingState, 'closed');
    });
  });

});
