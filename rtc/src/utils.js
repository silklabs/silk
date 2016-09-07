/**
 * Various WebRTC related utilities.
 *
 * @flow
 */

import invariant from 'assert';
import eventToPromise from 'event-to-promise';
import toJSON from 'silk-utils/calltojson';

import * as WebRTC from './webrtc';
import StructuredDataChannel from './structured_data_channel';

import type {Logger} from 'silk-log';

import type TransportEmitter from './transport_emitter';
import type {RTCPeerConnection, RTCDataChannel} from './webrtc';
import type {DataChannels, PeerTypes} from './types';

/**
 * Via ICE we can now communicate with our peer ... ICE may still be ongoing but
 * will not impact our ability to talk to the peer.
 */
export const ICE_READY = new Set([
  'connected',
  'completed',
]);

/**
 * ICE has failed or prematurely been disconnected.
 */
export const ICE_ERROR = new Set([
  // NOTE: We do not include disconnected here because we enter that state
  // regularly during renegotiation.
  'failed',
  'closed',
]);

/**
 * States where ICE has completely finished (either successfully or
 * unsuccessfully).
 */
export const ICE_FINISHED_STATES = new Set([
  'completed',
  'disconnected',
  // ... on Set does actually work but this makes flow happy.
  ...Array.from(ICE_ERROR),
]);

export function webrtcPromise(
  obj: Object,
  name: string,
  ...args: Array<mixed>
): Promise<any> {
  return new Promise((accept, reject) => {
    try {
      const func = obj[name];
      invariant(typeof func === 'function');
      func.call(obj, ...args, accept, reject);
    } catch (err) {
      reject(err);
    }
  });
}

export async function waitForStableSignaling(
  log: Logger,
  peerConnection: RTCPeerConnection,
): Promise<void> {
  let state = peerConnection.signalingState;
  while (state !== 'stable') {
    if (state === 'closed') {
      throw new Error(`Signaling state is closed`);
    }
    log.info(`Waiting for signaling state (current = ${state})`);
    await eventToPromise(peerConnection, 'signalingstatechange');
    state = peerConnection.signalingState;
  }
  log.info(`Done waiting for signaling state`);
}

export async function waitForDataChannel(
  peerConnection: RTCPeerConnection,
  name: string,
): Promise<RTCDataChannel> {
  let event;
  while (
    (event = await eventToPromise(peerConnection, 'datachannel'))
  ) {
    let { channel } = event;
    let { label } = channel;
    if (label === name) {
      return channel;
    }
  }
  throw new Error(`Unreachable ...`);
}

export async function waitForDataChannels(
  log: Logger,
  peerConnection: RTCPeerConnection,
  dataChannels: Array<string>,
): Promise<DataChannels> {
  // clone ...
  let remaining = dataChannels.slice();
  let result = new Map();

  let event;
  while (
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
export async function waitForIce(
  log: any,
  type: PeerTypes,
  peerConnection: RTCPeerConnection,
  transport: TransportEmitter,
): Promise<void> {

  // When we are notified of a local ice candidate to transmit.
  function localCandidateListener(event) {
    if (event.candidate) {
      let { candidate } = event;
      log.info(`(${type}) Sending ice candidate`, candidate);
      transport.emit('icecandidate', toJSON(candidate));
    } else {
      log.warn(`Got peer candidate without details...`);
    }
  }

  // When we receive a candidate to add to our peerConnection from the remote.
  function remoteCandidateListener(candidate) {
    log.info(`(${type}) Adding ice candidate from remote...`, candidate);
    try {
      peerConnection.addIceCandidate(new WebRTC.RTCIceCandidate(candidate));
    } catch (err) {
      log.error(`Failed to add candidate:`, candidate);
      // throw err;
    }
  }

  function cleanupListeners() {
    if (!ICE_FINISHED_STATES.has(peerConnection.iceConnectionState)) {
      // ICE connection state has changed but is not finished...
      return;
    }

    log.info(`(${type}) ICE connection state: "${peerConnection.iceConnectionState}" cleaning up`);

    // ICE is done one way or another ... We should cleanup...
    transport.removeListener('icecandidate', remoteCandidateListener);
    peerConnection.removeEventListener('icecandidate', localCandidateListener);
    peerConnection.removeEventListener('iceconnectionstatechange', cleanupListeners);
  }

  // TODO: Measure the number and frequency of candidates.
  transport.on('icecandidate', remoteCandidateListener);
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

/**
 * Both the caller and the recipient will emit events while signaling/ice
 * gathering. We want to capture this information and log/measure it.
 */
export function peerConnectionStateObserver(
  log: any,
  type: PeerTypes,
  peerConnection: RTCPeerConnection,
): void {
  const info = (value) => {
    log.info(`(${type}) ${value}`);
  };

  peerConnection.addEventListener('icecandidate', (event) => {
    info(`Got ice candidate ... with candidate ? ${!!event.candidate}`);
  });

  peerConnection.addEventListener('signalingstatechange', (event) => {
    info(`signal state: ${peerConnection.signalingState}`);
  });

  peerConnection.addEventListener('icegatheringstatechange', (event) => {
    // TODO: Add metrics...
    info(`ice gathering state: ${peerConnection.iceGatheringState}`);
  });

  peerConnection.addEventListener('iceconnectionstatechange', (event) => {
    // TODO: Add metrics...
    info(`connection state: ${peerConnection.iceConnectionState}`);
  });
}
