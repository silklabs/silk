/**
 * High level data channel abstraction.
 *
 * Intended to be an approximate imitation of the socket.io interface.
 *
 * NOTE: The idea is we introduce new DataChannel wrapper classes for different
 * types of data (such as out of order packets).
 *
 * @flow
 */

import invariant from 'assert';
import EventEmitter from 'events';
import createLog from 'silk-log';

import type {RTCDataChannel} from './webrtc';

const MIRROR_EVENTS = new Set([
  'close',
  'error',
]);

const emit = EventEmitter.prototype.emit;
const log = createLog('rtc:data_channel');

/**
 * All our events are transmitted in this form for easy dispatching.
 */
type EventPayload = {
  type: string;
  payload: Object;
  binaryPlaceholders: Array<[string, number]>;
};

type PendingFrame = {
  parts: Array<Blob>;
  bytesReceived: number;
  frame: EventPayload;
  when: number;
};

function isBinary(value: any): bool {
  // Note this will return true for ArrayBuffer, TypedArray (and Buffers).
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

function byteLength(value: ArrayBuffer | Buffer): number {
  if (value instanceof ArrayBuffer) {
    return value.byteLength;
  }
  invariant(typeof value.length === 'number');
  return value.length;
}

/**
 * Parse an incoming message event ....
 */
function parsePayload(input: { data: string }): EventPayload {
  let { data } = input;

  if (typeof data !== 'string') {
    log.error(`Bad data in message event`, data);
    throw new Error(`Unexpected type in .data ...`);
  }

  // XXX: Avoid buffer type and use typed array's directly ?
  let content = JSON.parse(data);
  invariant(typeof content.type === 'string');
  invariant(content.payload);
  invariant(typeof content.payload === 'object');
  invariant(Array.isArray(content.binaryPlaceholders));

  return {
    type: content.type,
    payload: content.payload,
    binaryPlaceholders: content.binaryPlaceholders,
  };
}

export default class StructuredDataChannel extends EventEmitter {
  _channel: ?RTCDataChannel;
  _pendingFrame: ?PendingFrame;

  _pendingWrites: Array<[string, mixed]> = [];

  constructor(channel: ?RTCDataChannel) {
    super();
    if (channel) {
      this.setChannel(channel);
    }
  }

  get label(): string {
    invariant(this._channel);
    return this._channel.label;
  }

  get bufferedAmount(): number {
    invariant(this._channel);
    return this._channel.bufferedAmount;
  }

  get open(): bool {
    invariant(this._channel);
    return this._channel.readyState === 'open';
  }

  _sendPendingWrites() {
    for (let write of this._pendingWrites) {
      // XXX: Using explicit indexing to make flow happy.
      this.emit(write[0], write[1]);
    }
    this._pendingWrites = [];
  }

  setChannel(channel: ?RTCDataChannel): void {
    // Pending frame details are only good for a single connection.
    this._pendingFrame = null;

    // Remove any listeners that may have been setup on the previous listener.
    const previousChannel = this._channel;
    if (previousChannel) {
      previousChannel.removeEventListener('close', this._onClose);
      previousChannel.removeEventListener('error', this._onError);
      previousChannel.removeEventListener('message', this._onMessage);
    }

    this._channel = channel;
    if (channel) {
      try {
        channel.binaryType = 'blob';
      } catch (ex) {
        log.debug(`Wasn't able to set binaryType to 'blob'. Soldering on.`);
      }

      channel.addEventListener('open', this._onOpen);
      channel.addEventListener('close', this._onClose);
      channel.addEventListener('error', this._onError);
      channel.addEventListener('message', this._onMessage);

      switch (channel.readyState) {
      case 'open':
        process.nextTick(this._onOpen);
        break;
      case 'closed':
        process.nextTick(this._onClose);
        break;
      case 'connecting':
      case 'closing':
        break;
      default:
        invariant(false);
      }
    }
  }

  _onOpen: () => void = () => {
    this._sendPendingWrites();
    emit.call(this, 'open');
  };

  _onClose: () => void = () => {
    emit.call(this, 'close');
  };

  _onError: (err: Error) => void = (err: Error) => {
    emit.call(this, 'error', err);
  };

  _onMessage: (content: Object) => void = (content: Object): void => {
    invariant(this._channel);
    const channel = this._channel;

    log.info('Incoming message on data channel', channel.label);

    if (this._pendingFrame) {
      log.info('Got pending binary frame');
      const { when, frame } = this._pendingFrame;
      const { binaryPlaceholders } = frame;
      invariant(binaryPlaceholders.length);

      const [name, totalPendingBytes] = binaryPlaceholders[0];

      // In case binaryType = 'blob' above didn't work...
      let data = content.data;
      if (isBinary(data)) {
        data = new Blob([data]);
      }

      if (!content || !data || !(data instanceof Blob)) {
        log.warn('Got malformed data in binary frame:', data);
        throw new Error(`Got malformed payload data...`);
      }

      this._pendingFrame.bytesReceived += data.size;
      let remainder = totalPendingBytes - this._pendingFrame.bytesReceived;

      if (this._pendingFrame.bytesReceived < totalPendingBytes) {
        this._pendingFrame.parts.push(data);
        log.verbose(`Waiting for more data for ${name} (${remainder})`);
        return;
      }

      log.verbose(`Finished collecting binary data for ${name}`);
      let newParts = [];
      let lastBlob = data;
      if (remainder > 0) {
        newParts.push(lastBlob.slice(remainder));
        lastBlob = lastBlob.slice(0, remainder);
      }
      this._pendingFrame.parts.push(lastBlob);

      if (this._pendingFrame.parts.length === 1) {
        // Avoid creating a new blob if there's only one anyway.
        frame.payload[name] = this._pendingFrame.parts[0];
      } else {
        frame.payload[name] = new Blob(this._pendingFrame.parts);

        // Free the partial blobs (only necessary in the app).
        if (typeof Blob.prototype.close === 'function') {
          this._pendingFrame.parts.forEach((blob) => {
            if (blob === lastBlob && remainder > 0) {
              return;
            }
            blob.close();
          });
        }
      }

      binaryPlaceholders.shift();
      if (binaryPlaceholders.length) {
        this._pendingFrame.bytesReceived = 0;
        this._pendingFrame.parts = newParts;

        // const [, newPendingBytes] = binaryPlaceholders[0];
        // TODO what if newParts[0].size <= newPendingBytes
        return;
      }

      this._pendingFrame = null;
      log.info(`Emitting frame after waiting ${Date.now() - when} ms for pending frames.`);
      log.info(`Emit ${channel.label} / ${frame.type}`);
      emit.call(this, frame.type, frame.payload);
      return;
    }

    let frame = parsePayload(content);

    if (frame.binaryPlaceholders.length) {
      log.info(`Got frame with ${frame.binaryPlaceholders.length} pending frames.`);
      const [, currentPendingBytes] = frame.binaryPlaceholders[0];
      invariant(typeof currentPendingBytes === 'number');

      // We need to keep track of how many bytes are outstanding as webrtc may
      // split up the packets.
      this._pendingFrame = {
        when: Date.now(),
        frame,
        bytesReceived: 0,
        parts: [],
      };
      return;
    }

    log.info(`Emitting ${frame.type} on ${channel.label}`);
    emit.call(this, frame.type, frame.payload);
  };

  emit(type: string, data: mixed): bool {
    if (MIRROR_EVENTS.has(type)) {
      throw new Error(`Cannot emit with event name: '${type}' (reserved).`);
    }

    if (!this._channel) {
      this._pendingWrites.push([type, data]);
      log.info('Buffering write until open');
      return true;
    }

    invariant(this._channel);
    const channel = this._channel;

    // Shallow clone the object so we can mutate it.
    let primaryFramePayload = Object.assign({}, data);
    let primaryFrame = {
      // Event type:
      type,

      // Raw payload of the event:
      payload: primaryFramePayload,

      // Binary data is sent in separate frames so keep track of which property
      // belongs to which frame.
      binaryPlaceholders: [],
    };
    let secondaryFrames = [];

    // XXX: We only optimize binary sending at the top level of the object.
    for (let name in primaryFramePayload) {
      const value = primaryFramePayload[name];
      if (isBinary(value)) {
        delete primaryFramePayload[name];
        primaryFrame.binaryPlaceholders.push([name, byteLength(value)]);
        secondaryFrames.push(value);
      }
    }

    let packed = JSON.stringify(primaryFrame);
    log.info(`Send ${type} [primary] (${packed.length})`);
    invariant(typeof packed === 'string');
    channel.send(packed);

    if (secondaryFrames.length) {
      for (let value of secondaryFrames) {
        log.info(`Send ${type} [binary] (${value.length})`);
        invariant(isBinary(value));
        channel.send(value);
      }
    }

    return true;
  }

  close() {
    if (this._channel) {
      this._channel.close();
    }
  }

}
