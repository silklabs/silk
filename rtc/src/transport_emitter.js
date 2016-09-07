/**
 * This module provides a thin wrapper to create event emitter interfaces out
 * of any transform stream which emits a particular set of objects:
 *
 * Example:
 *
 *  const transport = new PassThrough({ objectMode: true });
 *  const subject = new TransportEmitter(transport);
 *  transport.write(['foo', { bar: true }]);
 *
 * In the above example this will cause subject to emit foo with the given
 * object.
 *
 * @flow
 */

import EventEmitter from 'events';
import createLog from 'silk-log';

import type { Duplex } from 'stream';

// Various events we will want to hear about as they relate to the state of the
// stream...
const MIRROR_EVENTS = ['end', 'finish', 'error', 'close'];

const emit = EventEmitter.prototype.emit;
const log = createLog('rtc:transport_emitter');

export default class TransportEmitter extends EventEmitter {
  _transport: Duplex;
  _heldEvents: Map<string, Array<Array<mixed>>> = new Map();

  _onData: (payload: Array<mixed>) => void = (payload: Array<mixed>) => {
    const name = payload[0];
    let data = payload.slice(1);

    if (name === 'error' && data.length === 1 && typeof data[0] === 'string') {
      data[0] = new Error(data[0]);
    }

    // If we are currently holding this just buffer it and move on.
    const holding = this._heldEvents.get(name);
    if (holding) {
      holding.push(data);
      return;
    }
    log.info(`got data emitting: ${name}`);
    emit.call(this, name, ...data);
  };

  constructor(transport: Duplex) {
    super();

    this._transport = transport;

    transport.on('data', this._onData);
    for (let event of MIRROR_EVENTS) {
      transport.on(event, emit.bind(this, event));
    }

    // Avoid having stream errors become uncaught exceptions.
    this.on('error', (err) => log.warn('Stream error:', err));
  }

  releaseIncomingEvent(name: string): number {
    log.info(`releasing events for: ${name}`);
    const events = this._heldEvents.get(name);
    if (!events) {
      return 0;
    }

    // We use the presence of the given name to detect if we should buffer or
    // not ... So we need to delete this ASAP.
    this._heldEvents.delete(name);

    for (let event of events) {
      emit.call(this, name, ...event);
    }

    return events.length;
  }

  holdIncomingEvent(name: string) {
    if (!this._heldEvents.has(name)) {
      this._heldEvents.set(name, []);
    }
  }

  emit(name: string, ...data: Array<mixed>): bool {
    log.info(`writing: ${name}`);
    // $FlowFixMe: .write can handle objects :/
    this._transport.write([name, ...data]);
    return true;
  }

  end() {
    // Signal end of writing ...
    this._transport.end();
  }
}
