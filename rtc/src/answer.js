/* @flow */
import createLog from 'silk-log/device';
import eventToPromise from 'event-to-promise';
import timeout from 'silk-utils/timeout';
import toJSON from 'silk-utils/calltojson';
import invariant from 'assert';

import WebRTC from './webrtc';
import Peer from './peer';
import {
  peerConnectionStateObserver,
  webrtcPromise,
  waitForIce,
  waitForDataChannels,
} from './utils';

import type { Duplex } from 'stream';
import type { Logger } from 'silk-log';

import type { RTCPeerConnection } from '../interface/webrtc';

const OFFER_TIMEOUT = 2 * 60 * 1000; // 2 min,
const DATA_CHANNEL_TIMEOUT = 30 * 1000; // 30s.

const log = createLog('rtc:answer');

export class Recipient extends Peer {}

async function _answer(
  log: Logger,
  peerConnection: RTCPeerConnection,
  transport: Duplex,
  options?: Object
): Promise<Recipient> {
  peerConnectionStateObserver(log, 'recipient', peerConnection);

  log.info('recipient waiting for offer ...');

  let offer;
  try {
    offer = await Promise.race([
      eventToPromise(transport, 'data'),
      timeout(OFFER_TIMEOUT, new Error('Timed out while waiting for offer...')),
    ]);
  } catch (err) {
    // TODO: Add metric for offer timeout... This should never happen unless we
    // go offline...
    throw err;
  }

  const transportError = eventToPromise(transport, 'error').
    then((err) => {
      log.error(`Error in signaling stream during connect... ${err.stack}`);
      throw err;
    });


  // XXX: Joi ?
  invariant(offer && typeof offer === 'object');
  invariant(offer.sdp && typeof offer.sdp === 'object');
  invariant(Array.isArray(offer.dataChannels));
  invariant('mediaStream' in offer);

  if (offer.mediaStream) {
    log.info('expecting a remote media stream');
    // TODO: the remote side added a media stream to this connection.
    // Start listening to the RTCPeerConnection.onaddstream event and
    // ensure that we start playing the resulting stream.
  }

  log.info('got offer setting remote description');
  await webrtcPromise(
    peerConnection,
    'setRemoteDescription',
    new WebRTC.RTCSessionDescription(offer.sdp),
  );

  log.info('creating answer');
  let answer = await webrtcPromise(
    peerConnection,
    'createAnswer'
  );

  await webrtcPromise(
    peerConnection,
    'setLocalDescription',
    new WebRTC.RTCSessionDescription(answer)
  );

  log.info('answer sent');
  transport.write(toJSON(answer));

  await Promise.race([
    waitForIce(log, 'recipient', peerConnection, transport),
    transportError,
  ]);

  log.info('ICE done, sending "done" ack');
  transport.write(toJSON({ done: true }));

  let dataChannels;
  try {
    // $FlowFixMe: Cannot handle mixed promise return types.
    dataChannels = await Promise.race([
      waitForDataChannels(log, peerConnection, offer.dataChannels),
      timeout(DATA_CHANNEL_TIMEOUT, new Error(
        `Failed to initiate data channels ...`
      )),
    ]);
  } catch (err) {
    // For whatever reasons the dataChannels we expected where not given so bail
    // out and close the connection.
    peerConnection.close();
    // TODO: Metrics ...
    throw err;
  }

  return new Recipient(log, {
    peerConnection,
    dataChannels,
  });
}

export async function answer(
  transport: Duplex,
  options?: Object
): Promise<Recipient> {
  const peerConnection = new WebRTC.RTCPeerConnection({});

  try {
    return await _answer(log, peerConnection, transport, options);
  } catch (err) {
    log.error(`Failed to answer rtc call ${err.stack}`);
    // Ensure we always close the peerConnection.
    peerConnection.close();
    throw err;
  } finally {
    log.info(`(answer) Closing writable side of transport`);
    transport.end();
  }
}
