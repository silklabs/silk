/* @flow */
import createLog from 'silk-log/device';
import eventToPromise from 'event-to-promise';
import timeout from 'silk-utils/timeout';
import toJSON from 'silk-utils/calltojson';
import invariant from 'assert';

import * as WebRTC from './webrtc';
import Peer from './peer';
import {
  peerConnectionStateObserver,
  webrtcPromise,
  waitForIce,
  waitForDataChannels,
} from './utils';
import TransportEmitter from './transport_emitter';

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
  transport: TransportEmitter,
  options?: Object
): Promise<Recipient> {

  // We cannot set candidates before remote description is set but we may still
  // get candidates because of trickle ice. We "hold" the event emitter until
  // we have done this so we still get the events but do not handle them.
  transport.holdIncomingEvent('icecandidate');

  peerConnectionStateObserver(log, 'recipient', peerConnection);

  let offer;
  try {
    offer = await Promise.race([
      eventToPromise(transport, 'offer'),
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
  transport.emit('answer', toJSON(answer));

  const iceComplete = waitForIce(log, 'recipient', peerConnection, transport);
  transport.releaseIncomingEvent('icecandidate');
  await Promise.race([
    iceComplete,
    transportError,
  ]);

  log.info('ICE done, sending "done" ack');
  transport.emit('done');

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
    return await _answer(
      log, peerConnection, new TransportEmitter(transport), options
    );
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
