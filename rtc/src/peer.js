/* @flow */
import { EventEmitter } from 'events';

import { ICE_ERROR } from './utils';

import type {
  RTCPeerConnection,
} from '../interface/webrtc';
import type StructuredDataChannel from './structured_data_channel';
import type { DataChannels } from './types';

/**
 * Abstract functionality shared between call/answer.
 */
export default class Peer extends EventEmitter {
  peerConnection: RTCPeerConnection;

  _dataChannels: DataChannels;
  _log: any;

  constructor(log: any, options: {
    peerConnection: RTCPeerConnection,
    dataChannels: DataChannels,
  }) {
    super();

    this._log = log;

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

  _onIceConnectionState: () => void = () => {
    let state = this.peerConnection.iceConnectionState;
    this._log.info('ice connection state change', state);
    if (ICE_ERROR.has(state)) {
      this.emit('close', { reason: state });
    }
  };

  close() {
    this.peerConnection.close();
  }
}
