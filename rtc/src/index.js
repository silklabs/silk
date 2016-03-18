/**
 * Basic real time communication helpers and abstractions.
 *
 * TODO: Add lengthy description of how signaling works and what the transport
 * is supposed to look like.
 *
 * @flow
 */

import invariant from 'assert';
import { EventEmitter } from 'events';
import eventToPromise from 'event-to-promise';
import createLog from 'silk-log';

import StructuredDataChannel from './structured_data_channel';
import WebRTC from './webrtc';

import type {
  RTCPeerConnection,
  RTCDataChannelInit,
  RTCPeerConnectionIceEvent,
} from '../interface/webrtc';

import type {
  Duplex,
} from 'stream';

const log = createLog('rtc');

/**
 * For the browser we must supply some configs (for chrome at minimum).
 */
const CALLER_PEER_CONFIG = {
  iceServers: [
    // TODO: Use our own stun servers.
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

/**
 * Via ICE we can now communicate with our peer ... ICE may still be ongoing but
 * will not impact our ability to talk to the peer.
 */
const ICE_READY = new Set([
  'connected',
  'completed',
]);

/**
 * ICE has failed or prematurely been disconnected.
 */
const ICE_ERROR = new Set([
  'failed',
  'disconnected',
  'closed',
]);

/**
 * States where ICE has completely finished (either successfully or
 * unsuccessfully).
 */
const ICE_FINISHED_STATES = new Set([
  'completed',
  // ... on Set does actually work but this makes flow happy.
  ...Array.from(ICE_ERROR),
]);

const OFFER_TIMEOUT = 2 * 60 * 1000; // 2 min,
const ANSWER_TIMEOUT = 2 * 60 * 1000; // 2min.
const DATA_CHANNEL_TIMEOUT = 30 * 1000; // 30s.

type CallOptions = {
  dataChannels?: {[key: string]: RTCDataChannelInit};
};

type PeerTypes = 'caller' | 'recipient';
type DataChannels = Map<string, StructuredDataChannel>;

/**
 * Helper for safely calling the toJSON method if available.
 *
 * Mostly for node-webrtc compat which does not have toJSON methods but can be
 * directly passed to msgpack (unlike the browser variants which need to be
 * toJSON'ed).
 */
function toJSON(obj: any): Object {
  if (typeof obj.toJSON === 'function') {
    return obj.toJSON();
  }
  return obj;
}

/**
 * For use with Promise.race ... This function will produce a promise rejection.
 */
function timeout(duration: number, error: Error): Promise<void> {
  return new Promise((accept, reject) => {
    setTimeout(() => {
      reject(error);
    }, duration);
  });
}

/**
 * Technically webrtc supports promises but callbacks are the lowest common
 * denominator since promises are a relatively new addition to the standard.
 */
function webrtcPromise(peerConnection, name, ...args) {
  return new Promise((accept, reject) => {
    try {
      // $FlowFixMe: dynamic method call ...
      peerConnection[name](...args, accept, reject);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Both the caller and the recipient will emit events while signaling/ice
 * gathering. We want to capture this information and log/measure it.
 */
function peerConnectionStateObserver(
  type: PeerTypes,
  peerConnection: RTCPeerConnection,
): void {
  const logger = createLog(`rtc:${type}`);

  peerConnection.addEventListener('signalingstatechange', (event) => {
    // TODO: Add metrics...
    logger.info('signal state', peerConnection.signalingState);
  });

  peerConnection.addEventListener('icegatheringstatechange', (event) => {
    // TODO: Add metrics...
    logger.info('ice gathering state', peerConnection.iceGatheringState);
  });

  peerConnection.addEventListener('iceconnectionstatechange', (event) => {
    // TODO: Add metrics...
    logger.info('connection state', peerConnection.iceConnectionState);
  });
}

async function waitForDataChannels(
  peerConnection: RTCPeerConnection,
  dataChannels: Array<string>,
): Promise<DataChannels> {
  // clone ...
  let remaining = dataChannels.concat();
  let result = new Map();

  let event;
  while(
    remaining.length &&
    (event = await eventToPromise(peerConnection, 'datachannel'))
  ) {
    let { channel } = event;
    let { label } = channel;
    let idx = remaining.indexOf(label);
    log.info('Notified of data channel', label);
    // If we find a data channel we didn't expect throw an error ... We
    // explicitly send the list as part of signaling so it should never happen.
    if (idx === -1) {
      // TODO: Metrics ...
      throw new Error(`Unexpected channel name: ${label}`);
    }

    remaining.splice(idx, 1);
    result.set(label, new StructuredDataChannel(channel));
  }

  return result;
}

/**
 * This helper sets up various listeners for the ICE signaling process.
 *
 *  - Add listener to our own connection for candidates to send to remote.
 *
 *  - Send candidates over to remote.
 *
 *  - Handle termination or other errors during the signaling process. Those
 *    errors will result in a promise rejection.
 */
async function waitForIce(
  type: PeerTypes,
  peerConnection: RTCPeerConnection,
  transport: Duplex,
) {

  // When we are notified of a local ice candidate to transmit.
  function localCandidateListener(event) {
    if (event.candidate) {
      let { candidate } = event;
      log.info(`(${type}) Sending ice candidate`, candidate);
      transport.write(toJSON(candidate));
    } else {
      log.warn(`Got peer candidate without details...`);
    }
  }

  // When we receive a candidate to add to our peerConnection from the remote.
  function remoteCandidateListener(candidate) {
    log.info(`(${type}) Adding ice candidate from remote...`, candidate);
    peerConnection.addIceCandidate(new WebRTC.RTCIceCandidate(candidate));
  }

  function cleanupListeners() {
    if (!ICE_FINISHED_STATES.has(peerConnection.iceConnectionState)) {
      // ICE connection state has changed but is not finished...
      return;
    }

    log.info(`(${type}) ICE connection state: "${peerConnection.iceConnectionState}" cleaning up`);

    // ICE is done one way or another ... We should cleanup...
    transport.removeListener('data', remoteCandidateListener);
    peerConnection.removeEventListener('icecandidate', localCandidateListener);
    peerConnection.removeEventListener('iceconnectionstatechange', cleanupListeners);
  }

  // TODO: Measure the number and frequency of candidates.
  transport.on(`data`, remoteCandidateListener);
  peerConnection.addEventListener('icecandidate', localCandidateListener);
  peerConnection.addEventListener('iceconnectionstatechange', cleanupListeners);

  // Wait for state changes ...
  while (
    await eventToPromise(peerConnection, 'iceconnectionstatechange')
  ) {
    let state = peerConnection.iceConnectionState;
    log.info(`Waiting for ICE to complete state: ${state}`);

    // We should be able to start talking to our peer...
    if (ICE_READY.has(state)) {
      return;
    }

    // Something has failed during setup...
    if (ICE_ERROR.has(state)) {
      // TODO: Add metrics for the various types ...
      throw new Error(`Failed to establish connection to peer.. State: ${state}`);
    }
  }
}

// Abstract functionality shared between both Caller and Recipient.
class PeerConnection extends EventEmitter {
  peerConnection: RTCPeerConnection;

  _dataChannels: DataChannels;

  constructor(options: {
    peerConnection: RTCPeerConnection,
    dataChannels: DataChannels,
  }) {
    super();

    let { peerConnection, dataChannels } = options;
    this.peerConnection = peerConnection;
    this._dataChannels = dataChannels;

    peerConnection.addEventListener(
      'iceconnectionstatechange',
      this._onIceConnectionState
    );
  }

  channel(name: string): ?StructuredDataChannel {
    return this._dataChannels.get(name);
  }

  _onIceConnectionState = () => {
    let state = this.peerConnection.iceConnectionState;
    log.info('ice connection state change', state);
    if (ICE_ERROR.has(state)) {
      this.emit('close', { reason: state });
    }
  };

  close() {
    this.peerConnection.close();
  }
}


/**
 * Representation of the "caller" of the webrtc call.. The caller defines the
 * data channels.
 */
export class Caller extends PeerConnection {
  async peer(transport: Duplex): Promise<void> {
    try {
      return await this._peer(transport);
    } catch (err) {
      log.error(`Failed to peer connection: ${err.stack}`);
      throw err;
    } finally {
      // Ensure we close our writable side in all cases.
      log.info('(call) Closing writable side of transport');
      transport.end();
    }
  }

  async _peer(transport: Duplex): Promise<void> {
    let { peerConnection } = this;

    peerConnection.addEventListener('icecandidate', (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate) {
        log.verbose('caller sending candidate', event.candidate);
        transport.write(toJSON(event.candidate));
      }
    });

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
      dataChannels: Array.from(this._dataChannels.keys()),
    });

    // TODO: Add timeout and better error handling ...

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

    await waitForIce('caller', peerConnection, transport);
  }
}

export function call(
  options?: CallOptions = {}
): Caller {
  let peerConnection = new WebRTC.RTCPeerConnection(CALLER_PEER_CONFIG);
  peerConnectionStateObserver('caller', peerConnection);

  let dataChannels = new Map();

  // Initialize the data channels so they are part of the initial offer...
  // Additional data channels cannot be added after the initial negotiation.
  let channels = options.dataChannels;
  if (channels) {
    for (let name in channels) {
      let configuration = channels[name];
      let channel = peerConnection.createDataChannel(name, configuration);
      dataChannels.set(name, new StructuredDataChannel(channel));
    }
  }

  return new Caller({
    peerConnection,
    dataChannels,
  });
}

export class Recipient extends PeerConnection {}

async function _answer(
  transport: Duplex,
  options?: Object
): Promise<Recipient> {
  let peerConnection = new WebRTC.RTCPeerConnection({});
  peerConnectionStateObserver('recipient', peerConnection);

  // TODO: Add timeouts ...
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

  // XXX: Joi ?
  invariant(offer && typeof offer === 'object');
  invariant(offer.sdp && typeof offer.sdp === 'object');
  invariant(Array.isArray(offer.dataChannels));

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

  await waitForIce('recipient', peerConnection, transport);

  let dataChannels;
  try {
    // $FlowFixMe: type application of identifier `Promise` (wtf).
    dataChannels = await Promise.race([
      waitForDataChannels(peerConnection, offer.dataChannels),
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
  } finally {
    transport.end();
  }


  // $FlowFixMe: https://github.com/facebook/flow/issues/545
  return new Recipient({
    peerConnection,
    dataChannels,
  });
}

export async function answer(
  transport: Duplex,
  options?: Object
): Promise<Recipient> {
  try {
    // $FlowFixMe: https://github.com/facebook/flow/issues/545
    return await _answer(transport, options);
  } catch (err) {
    log.error(`Failed to answer rtc call ${err.stack}`);
    throw err;
  } finally {
    log.info(`(answer) Closing writable side of transport`);
  }
}
