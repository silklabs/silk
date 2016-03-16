/**
 * High level data channel abstraction.
 *
 * Intended to be an approximate imitation of the socket.io interface.
 *
 * Internally all data is msgpack encoded.
 *
 * NOTE: The idea is we introduce new DataChannel wrapper classes for different
 * types of data (such as out of order packets).
 *
 * @flow
 */

import invariant from 'assert';
import msgpack from 'msgpack-lite';
import { EventEmitter } from 'events';
import createLog from 'silk-log';

import type {
  RTCDataChannel,
} from '../interface/webrtc';

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
  binaryPlaceholders: [];
};

type PendingFrame = {
  frame: EventPayload;
  when: number;
};

function isBinary(value: any): bool {
  // Note this will return true for ArrayBuffer, TypedArray (and Buffers).
  return ArrayBuffer.isView(value);
}

/**
 * Parse an incoming message event ....
 */
function parsePayload(input: { data: ArrayBuffer }): EventPayload {
  let { data } = input;

  if (!(data instanceof ArrayBuffer)) {
    log.error(`Bad data in message event`, data);
    throw new Error(`Unexpected type in .data ...`);
  }

  // XXX: Avoid buffer type and use typed array's directly ?
  // $FlowFixMe: buffer does in fact allow ArrayBuffer types ..
  let content = msgpack.decode(new Buffer(data));
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

  /**
   * Intentionally public ... We do not replicate all the getters that
   * DataChannel's expose but they can be accessed here if absolutely needed.
   */
  channel: RTCDataChannel;

  _pendingFrame: ?PendingFrame;

  constructor(channel: RTCDataChannel) {
    super();
    this.channel = channel;
    for (let eventName of MIRROR_EVENTS) {
      channel.addEventListener(eventName, (event) => { //eslint-disable-line no-loop-func
        emit.call(this, eventName, event);
      });
    }

    channel.addEventListener('message', this._onMessage);
  }

  _onMessage: (content: Object) => void = (content: Object): void => {
    log.info('Incoming message on data channel', this.channel.label);

    if (this._pendingFrame) {
      log.info('Got pending binary frame');
      const { when, frame } = this._pendingFrame;
      const { binaryPlaceholders } = frame;
      invariant(binaryPlaceholders.length);
      const name = binaryPlaceholders.shift();

      let frameValue;

      if (!content || !content.data || !(content.data instanceof ArrayBuffer)) {
        log.info('Got malformed data in binary frame.');
        frameValue = null;
      } else {
        frameValue = new Buffer(content.data);
      }

      frame.payload[name] = frameValue;

      if (binaryPlaceholders.length === 0) {
        this._pendingFrame = null;
        log.info(`Emitting frame after waiting ${Date.now() - when} ms for pending frames.`);
        emit.call(this, frame.type, frame.payload);
      }
      return;
    }

    let frame = parsePayload(content);

    if (frame.binaryPlaceholders.length) {
      log.info(`Got frame with ${frame.binaryPlaceholders.length} pending frames.`);
      this._pendingFrame = { when: Date.now(), frame };
      return;
    }

    log.info(`Emitting ${frame.type} on ${this.channel.label}`);
    emit.call(this, frame.type, frame.payload);
  };

  emit(type: string, data: Object): void {
    if (MIRROR_EVENTS.has(type)) {
      throw new Error(`Cannot emit with event name: '${type}' (reserved).`);
    }

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
        // Remove the property it will save some bytes in the msgpack content.
        delete primaryFramePayload[name];
        primaryFrame.binaryPlaceholders.push(name);
        secondaryFrames.push(value);
      }
    }

    let packed = msgpack.encode(primaryFrame);
    log.info(`Send ${type} [primary] (${packed.length})`);
    this.channel.send(packed);

    if (secondaryFrames.length) {
      log.info(`Sending ${secondaryFrames.length} binary frames.`);
      for (let value of secondaryFrames) {
        log.info(`Send ${type} [binary] (${value.length})`);
        this.channel.send(value);
      }
    }
  }

  close() {
    this.channel.close();
  }

}
