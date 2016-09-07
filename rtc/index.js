/**
 * @flow
 */

import CallManager from './src/signaling/call_manager';
import AnswerManager from './src/signaling/answer_manager';
import * as WebRTC from './src/webrtc';
import Peer from './src/peer';

import type { SilkApi } from 'silk-api';
import type { Duplex } from 'stream';


const PEER_CONFIG = {
  iceServers: [
    // TODO: Use our own stun servers.
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

export type { UserMediaConstraints } from './src/webrtc';
export type { default as StructuredDataChannel } from './src/structured_data_channel';

export { default as Peer } from './src/peer';

export function call(
  api: SilkApi,
  deviceId: string,
): Peer {
  const manager = new CallManager(api, deviceId);
  const pc = new WebRTC.RTCPeerConnection(PEER_CONFIG);

  return new Peer(pc, manager);
}

export function answer(
  transport: Duplex,
): Peer {
  const manager = new AnswerManager(transport);
  const pc = new WebRTC.RTCPeerConnection(PEER_CONFIG);

  return new Peer(pc, manager);
}
