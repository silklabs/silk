/**
 * Basic real time communication helpers and abstractions.
 *
 * TODO: Add lengthy description of how signaling works and what the transport
 * is supposed to look like.
 *
 * @flow
 */

import eventToPromise from 'event-to-promise';
import createLog from 'silk-log';
import timeout from 'silk-utils/timeout';
import toJSON from 'silk-utils/calltojson';

import {
  peerConnectionStateObserver,
  waitForIce,
  webrtcPromise,
} from './utils';

import WebRTC from './webrtc';

import type {
  Duplex,
} from 'stream';

import type {
  RTCDataChannel,
  RTCPeerConnection,
  RTCDataChannelInit,
  RTCPeerConnectionIceEvent,
} from '../interface/webrtc';

const log = createLog('rtc');

/**
 * For the browser we must supply some configs (for chrome at minimum).
 */
const CALLER_PEER_CONFIG = {
  iceServers: [
    // TODO: Use our own stun servers.
    { url: 'stun:stun.l.google.com:19302' },
  ],
};

const ANSWER_TIMEOUT = 2 * 60 * 1000; // 2min.

export type CallOptions = {
  dataChannels?: {[key: string]: RTCDataChannelInit};
};

type Caller = [RTCPeerConnection, Map<string, RTCDataChannel>];

function _peer(caller: Caller, transport: Duplex): Promise<void> {
  const [peerConnection] = caller;

  const onIceCandidate = (event: RTCPeerConnectionIceEvent) => {
    if (event.candidate) {
      log.verbose('caller sending candidate', event.candidate);
      try {
        transport.write(toJSON(event.candidate));
      } catch (err) {
        log.warn(`Failed to write candidate to stream: ${err.stack}`);
      }
    }
  };
  peerConnection.addEventListener('icecandidate', onIceCandidate);

  const transportError = eventToPromise(transport, 'error')
    .then((err) => {
      log.debug('Error in stream transport', err, err.stack);
      peerConnection.removeEventListener('icecandidate', onIceCandidate);
      throw err;
    });

  return Promise.race([
    _call(caller, transport),
    transportError,
  ]);
}

async function _call(caller: Caller, transport: Duplex): Promise<void> {
  const [peerConnection, dataChannels] = caller;

  log.info('creating offer...');
  let desc = await webrtcPromise(peerConnection, 'createOffer');
  await webrtcPromise(
    peerConnection,
    'setLocalDescription',
    new WebRTC.RTCSessionDescription(desc)
  );

  // initiate the peer ...
  // $FlowFixMe: Hard to express that our specific transport can accept objects.
  transport.write({
    // Most important thing is obviously the offer itself...
    sdp: toJSON(desc),
    // We also send along the list of expected data channels so we can await
    // them...
    dataChannels: Array.from(dataChannels.keys()),
  });

  let answer = await Promise.race([
    eventToPromise(transport, 'data'),
    timeout(ANSWER_TIMEOUT, new Error('Timed out waiting for answer')),
  ]);

  log.info('caller got answer');
  await webrtcPromise(
    peerConnection,
    'setRemoteDescription',
    new WebRTC.RTCSessionDescription(answer)
  );

  await waitForIce(log, 'caller', peerConnection, transport);
  transport.end();
}

export async function peer(caller: Caller, transport: Duplex): Promise<void> {
  try {
    return await _peer(caller, transport);
  } catch (err) {
    log.error(`Failed to peer connection: ${err.stack}`);
    // Ensure we always close the peerConnection.
    caller[0].close();
    throw err;
  } finally {
    // Ensure we close our writable side in all cases.
    log.info('(call) Closing writable side of transport');
    transport.end();
  }
}

export function createCaller(options?: CallOptions = {}): Caller {
  const log = createLog('rtc:call');
  let peerConnection = new WebRTC.RTCPeerConnection(CALLER_PEER_CONFIG);

  peerConnectionStateObserver(log, 'caller', peerConnection);

  let dataChannels = new Map();

  // Initialize the data channels so they are part of the initial offer...
  // Additional data channels cannot be added after the initial negotiation.
  let channels = options.dataChannels;
  if (channels) {
    for (let name in channels) {
      let configuration = channels[name];
      let channel = peerConnection.createDataChannel(name, configuration);
      dataChannels.set(name, channel);
    }
  }

  return [peerConnection, dataChannels];
}
