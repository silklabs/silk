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

import * as WebRTC from './webrtc';
import TransportEmitter from './transport_emitter';

import type {
  RTCDataChannel,
  RTCPeerConnection,
  RTCDataChannelInit,
  RTCPeerConnectionIceEvent,
} from '../interface/webrtc';

import type { Duplex } from 'stream';

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

export type MediaStreamsPair = {
  local?: any;
  remote?: any;
};

export type CallOptions = {
  dataChannels?: {[key: string]: RTCDataChannelInit};
  mediaStreams?: MediaStreamsPair;
};

type Caller = [RTCPeerConnection, Map<string, RTCDataChannel>,
               MediaStreamsPair];

function _peer(caller: Caller, transport: TransportEmitter): Promise<void> {
  const [peerConnection] = caller;

  const onIceCandidate = (event: RTCPeerConnectionIceEvent) => {
    if (event.candidate) {
      log.verbose('caller sending candidate', event.candidate);
      try {
        transport.emit('icecandidate', toJSON(event.candidate));
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

async function _call(caller: Caller, transport: TransportEmitter): Promise<void> {
  const [peerConnection, dataChannels, mediaStreams] = caller;

  // We cannot set candidates before remote description is set but we may still
  // get candidates because of trickle ice. We "hold" the event emitter until
  // we have done this so we still get the events but do not handle them.
  transport.holdIncomingEvent('icecandidate');
  // The done event may come in at any time so buffer it until we are listening.
  transport.holdIncomingEvent('done');

  log.info('creating offer...');
  let desc = await webrtcPromise(peerConnection, 'createOffer');
  await webrtcPromise(
    peerConnection,
    'setLocalDescription',
    new WebRTC.RTCSessionDescription(desc)
  );

  // initiate the peer ...
  transport.emit('offer', {
    // Most important thing is obviously the offer itself...
    sdp: toJSON(desc),
    // We also send along the list of expected data channels so we can await
    // them...
    dataChannels: Array.from(dataChannels.keys()),
    // Should the remote side wait for a media stream to be offered?
    mediaStream: mediaStreams && ('local' in mediaStreams),
  });

  let answer = await Promise.race([
    eventToPromise(transport, 'answer'),
    timeout(ANSWER_TIMEOUT, new Error('Timed out waiting for answer')),
  ]);

  if ('remote' in mediaStreams) {
    log.info('expecting a remote media stream');
    // TODO: the caller expects the answerer to send back a remote
    // media stream.  Start listening to the
    // RTCPeerConnection.onaddstream event and update
    // `mediaStreams.remote` when it arrives.
  }

  log.info('caller got answer');
  await webrtcPromise(
    peerConnection,
    'setRemoteDescription',
    new WebRTC.RTCSessionDescription(answer)
  );

  const iceComplete = waitForIce(log, 'caller', peerConnection, transport);
  transport.releaseIncomingEvent('icecandidate');
  await iceComplete;

  log.info('ICE done, waiting for peer ack ...');
  const doneAck = eventToPromise(transport, 'done');
  transport.releaseIncomingEvent('done');
  await Promise.race([
    doneAck,
    timeout(ANSWER_TIMEOUT, new Error('Timed out waiting for "done" ack')),
  ]);
  transport.end();
}

export async function peer(caller: Caller, transport: Duplex): Promise<void> {
  try {
    return await _peer(caller, new TransportEmitter(transport));
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

  let mediaStreams = Object.assign({}, options.mediaStreams);
  if ('local' in mediaStreams) {
    log.info('Added local MediaStream', mediaStreams.local);
    peerConnection.addStream(mediaStreams.local);
  }

  return [peerConnection, dataChannels, mediaStreams];
}
