/**
 * @flow
 */

import createLog from 'silk-log';

import SegmentProvider from './segment_provider';

import type { Socket } from 'socket.io';

type FrameMessage = {
  frame: Buffer;
};

type Listener = (message: FrameMessage, ack: ?Function) => void;

const log = createLog('segment-provider-socketio');

export default class SegmentProviderSocketIO extends SegmentProvider {

  static getOrCreate(socket: Socket, deviceId: string): SegmentProvider {
    let stream = SegmentProvider.get(deviceId);
    if (stream) {
      return stream;
    }
    stream = new SegmentProviderSocketIO(socket, deviceId);
    return stream;
  }

  _socket: Socket;

  constructor(socket: Socket, deviceId: string) {
    log.debug(`['${deviceId}']: constructor()`);

    super(deviceId);

    this._socket = socket;

    const stream = `video-${deviceId}`;
    socket.on(stream, this._onDeviceVideoSegment);
    socket.emit('join', stream);
  }

  // TODO use this
  close(): void {
    log.debug(`['${this._id}']: close()`);
    this._socket.removeListener(`video-${this._id}`, this._onDeviceVideoSegment);
    super.close();
  }

  _onDeviceVideoSegment: Listener = (message, ack) => {
    log.debug(`['${this._id}']: onDeviceVideoSegment(${message.frame.length})`);

    if (ack) {
      ack();
    }

    this.pushFrame(message.frame);
  };
}
