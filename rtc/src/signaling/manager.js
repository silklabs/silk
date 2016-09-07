/**
 * Abstract implementation for a signaling stream provider.
 *
 * @flow
 */

import invariant from 'assert';
import eventToPromise from 'event-to-promise';
import createLog from 'silk-log';
import toJSON from 'silk-utils/calltojson';

import {
  peerConnectionStateObserver,
  webrtcPromise,
  waitForIce,
  waitForStableSignaling,
} from '../utils';

import {
  RTCSessionDescription,
  RTCIceCandidate,
} from '../webrtc';


import type { RTCPeerConnection } from '../webrtc';
import type TransportEmitter from '../transport_emitter';
import type { PeerTypes } from '../types';

const log = createLog('rtc:signaling:manager');

export default class SignalingManager {

  /**
   * name/label of the data channel used for additional signaling.
   */
  static SIGNALING_DATA_CHANNEL: string = 'signaling';
  static PEER_TYPE: ?PeerTypes;

  _peerConnection: ?RTCPeerConnection;
  _transport: ?TransportEmitter;
  _hasSignaled: bool = false;

  constructor() {
    invariant(this.constructor.SIGNALING_DATA_CHANNEL);
    invariant(this.constructor.PEER_TYPE);
  }

  async _negotiateAnswer(
    pc: RTCPeerConnection,
    transport: TransportEmitter
  ) {
    const type = this.constructor.PEER_TYPE;
    invariant(type);
    const pendingIce = waitForIce(log, type, pc, transport);
    const offer = await eventToPromise(transport, 'offer');
    await webrtcPromise(
      pc, 'setRemoteDescription', new RTCSessionDescription(offer)
    );

    const answer = await webrtcPromise(pc, 'createAnswer');
    transport.emit('answer', answer);
    await webrtcPromise(
      pc, 'setLocalDescription', new RTCSessionDescription(answer)
    );
    await pendingIce;
  }

  async _negotiateOffer(
    pc: RTCPeerConnection,
    transport: TransportEmitter,
  ): Promise<void> {
    const type = this.constructor.PEER_TYPE;
    invariant(type);

    const localDesc = await webrtcPromise(pc, 'createOffer');
    const pendingIce = waitForIce(log, type, pc, transport);
    await webrtcPromise(pc, 'setLocalDescription', localDesc);
    transport.emit('offer', localDesc);
    const answer = await eventToPromise(transport, 'answer');
    await webrtcPromise(
      pc, 'setRemoteDescription', new RTCSessionDescription(answer)
    );

    await pendingIce;
  }

  _onRenegotiate: () => Promise<void> = async () => {
    const type = this.constructor.PEER_TYPE;
    invariant(type);
    log.info(`(${type}) Renegotiation needed ...`);
    invariant(this._peerConnection);

    // To avoid races we must ensure that we are already in a stable state before
    // responding to state changes...
    await waitForStableSignaling(log, this._peerConnection);

    const localDesc = await webrtcPromise(this._peerConnection, 'createOffer');
    await webrtcPromise(this._peerConnection, 'setLocalDescription', localDesc);
    invariant(this._transport);
    // Start holding incoming ice candidates until after setRemote is called...
    this._transport.holdIncomingEvent('icecandidate');
    this._transport.emit('offer', localDesc);
  };

  _onOffer: (offer: Object) => Promise<void> = async (offer: Object) => {
    const type = this.constructor.PEER_TYPE;
    invariant(type);

    log.info(`(${type}) Got remote offer after initial session connect...`, {
      iceConnectionState: this._peerConnection.iceConnectionState,
      iceGatheringState: this._peerConnection.iceGatheringState,
      signalingState: this._peerConnection.signalingState,
    });

    // To avoid races we must ensure that we are already in a stable state before
    // responding to state changes...
    await waitForStableSignaling(log, this._peerConnection);

    // Buffer incoming ice candidates until we have set the remote desc....
    this._transport.holdIncomingEvent('icecandidate');
    const sdp = new RTCSessionDescription(offer);
    await webrtcPromise(this._peerConnection, 'setRemoteDescription', sdp);
    this._transport.releaseIncomingEvent('icecandidate');

    const answer = await webrtcPromise(this._peerConnection, 'createAnswer');
    await webrtcPromise(this._peerConnection, 'setLocalDescription', answer);
    this._transport.emit('answer', answer);
    log.info(`(${type}) Successfully renegotiated offer ...`);
  };

  _onAnswer: (answer: Object) => Promise<void> = async (answer: Object) => {
    const type = this.constructor.PEER_TYPE;
    invariant(type);

    // NOTE: We do not wait for a stable state here since we do that during the
    // renegotiation event.

    log.info(`(${type}) Got remote answer after initial session connect...`, {
      iceConnectionState: this._peerConnection.iceConnectionState,
      iceGatheringState: this._peerConnection.iceGatheringState,
      signalingState: this._peerConnection.signalingState,
    });

    const sdp = new RTCSessionDescription(answer);
    await webrtcPromise(this._peerConnection, 'setRemoteDescription', sdp);
    this._transport.releaseIncomingEvent('icecandidate');
    log.info(`(${type}) successfully renegotiated answer ...`);
  };

  _onRemoteIceCandidate: (event: Object) => Promise<void> = async (event: Object) => {
    const type = this.constructor.PEER_TYPE;
    invariant(type);

    log.info(`(${type}) Got remote candidate`);
    const candidate = new RTCIceCandidate(event);
    invariant(this._peerConnection);
    try {
      this._peerConnection.addIceCandidate(candidate);
    } catch (err) {
      log.error(`Could not add candidate:`, event, err.stack);
    }
  };

  _onLocalIceCandidate: (event: Object) => Promise<void> = async (event: Object) => {
    const type = this.constructor.PEER_TYPE;
    invariant(type);

    if (!event.candidate) {
      return;
    }

    log.info(`(${type}) got local ice candidate sending it ...`);
    invariant(this._transport);
    invariant(this._peerConnection);
    this._transport.emit('icecandidate', toJSON(event.candidate));
  };

  /**
   * Signal and manage further signaling for the given peer connection.
   */
  async signal(pc: RTCPeerConnection): Promise<TransportEmitter> {
    if (this._peerConnection) {
      if (pc !== this._peerConnection) {
        throw new Error(`Cannot re-signal with different RTCPeerConnection.`);
      }

      pc.removeEventListener('negotiationneeded', this._onRenegotiate);
      pc.removeEventListener('icecandidate', this._onLocalIceCandidate);
    }

    const type = this.constructor.PEER_TYPE;
    invariant(type);
    peerConnectionStateObserver(log, type, pc);

    this._hasSignaled = true;
    this._peerConnection = pc;
    // TODO: Implement initial connect timeout ...
    const transport = await this._signal(pc);

    this._transport = transport;
    pc.addEventListener('negotiationneeded', this._onRenegotiate);
    pc.addEventListener('icecandidate', this._onLocalIceCandidate);

    transport.on('icecandidate', this._onRemoteIceCandidate);
    transport.on('offer', this._onOffer);
    transport.on('answer', this._onAnswer);

    return transport;
  }

  /**
   * Destroy handlers and connection associated with this manager.
   */
  destroy() {
    const pc = this._peerConnection;
    if (pc) {
      pc.removeEventListener('negotiationneeded', this._onRenegotiate);
      pc.removeEventListener('icecandidate', this._onLocalIceCandidate);
      pc.close();
      this._peerConnection = null;
    }

    const transport = this._transport;
    if (transport) {
      transport.removeListener('icecandidate', this._onRemoteIceCandidate);
      transport.removeListener('offer', this._onRemoteIceCandidate);
      transport.removeListener('answer', this._onAnswer);
      this._transport = null;
    }

  }

  async _signal(pc: RTCPeerConnection): Promise<TransportEmitter> {
    throw new Error('Provide an implementation...');
  }
}
