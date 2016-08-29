/**
 * @flow
 */

import { Duplex } from 'stream';
import createLog from 'silk-log';

import type {RTCDataChannel} from 'node-webrtc';

const log = createLog('rtc:data_channel_duplex');

export default class DataChannelDuplex extends Duplex {
  _dataChannel: RTCDataChannel;
  _ended: bool = false;

  constructor(dc: RTCDataChannel) {
    super();
    const { label } = dc;
    this._dataChannel = dc;
    this.once('end', () => {
      log.info(`(${label}) Data channel end`);
      this._ended = true;
    });

    dc.addEventListener('message', (event) => {
      const buffer = new Buffer(event.data);
      log.info(`(${label}) Got bytes: ${buffer.length}`);
      this.push(buffer);
    });

    dc.addEventListener('close', () => {
      log.info(`(${label}) Data channel close ...`);
      if (this._ended) {
        this.emit('close');
      }

      this.push(null);
      // $FlowFixMe: https://github.com/facebook/flow/pull/2330
      this.end(() => {
        this.emit('close');
      });
    });
  }

  _write(data: string|Buffer, enc: string, callback: Function): boolean {
    this._dataChannel.send(data);
    callback();
    return true;
  }

  _read() {
    // no-op as we will push data in via message...
  }
}
