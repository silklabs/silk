/* @flow */
import createLog from 'silk-log';
import { Duplex } from 'stream';
import { JSONDuplexStream } from 'silk-streams';

import Manager from './manager';
import TransportEmitter from '../transport_emitter';
import DataChannelDuplex from '../data_channel_duplex';
import {waitForDataChannel} from '../utils';

import type {RTCPeerConnection} from '../webrtc';

const log = createLog('rtc:signaling:answer_manager');

export default class AnswerManager extends Manager {

  static PEER_TYPE = 'recipient';

  _initialTransport: TransportEmitter;
  _systemTransport: TransportEmitter;

  constructor(stream: Duplex) {
    super();
    this._initialTransport = new TransportEmitter(stream);
  }

  async _signal(pc: RTCPeerConnection): Promise<TransportEmitter> {
    log.info('Answering ....');
    const transport = this._initialTransport;
    const pendingSystemChannel = waitForDataChannel(
      pc, Manager.SIGNALING_DATA_CHANNEL
    );

    await this._negotiateAnswer(pc, transport);
    const systemChannel = await pendingSystemChannel;
    transport.emit('done');
    log.info(`Finishing answering ...`);

    return new TransportEmitter(
      new JSONDuplexStream(new DataChannelDuplex(systemChannel))
    );
  }
}
