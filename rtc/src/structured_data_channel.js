/**
 * High level data channel abstraction.
 *
 * Intended to be an approximate imitation of the socket.io interface.
 *
 * Internally all data is msgpack encoded.
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
};

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

  return {
    type: content.type,
    payload: content.payload,
  };
}

export default class StructuredDataChannel extends EventEmitter {

  /**
   * Intentionally public ... We do not replicate all the getters that
   * DataChannel's expose but they can be accessed here if absolutely needed.
   */
  channel: RTCDataChannel;

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
    let decoded = parsePayload(content);
    log.info(`Emitting ${decoded.type} on ${this.channel.label}`);
    emit.call(this, decoded.type, decoded.payload);
  };

  emit(type: string, payload: Object): void {
    if (MIRROR_EVENTS.has(type)) {
      throw new Error(`Cannot emit with event name: '${type}' (reserved).`);
    }

    let packed = msgpack.encode({
      type,
      payload,
    });

    this.channel.send(packed);
  }

  close() {
    this.channel.close();
  }

}
