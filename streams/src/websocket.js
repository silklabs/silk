/**
 * Wrapper for WebSocket duplex stream. This interface very intentionally
 * sticks to the w3c spec for WebSocket clients rather than the slightly
 * nicer interface offered by ws for node.
 *
 *  - Buffers writes during connect.
 *  - Does not reconnect.
 *
 * @flow
 */

import invariant from 'assert';
import { Duplex } from 'stream';
import createLog from 'silk-log';

import type { Logger } from 'silk-log';
import type { EventEmitter } from 'events';
import type NodeWebSocket from 'ws';

const log = createLog('streams:websocket');

function removeListener(
  target: EventEmitter | EventTarget,
  event: string,
  fn: Function,
): void {
  if (typeof target.removeEventListener === 'function') {
    target.removeEventListener(event, fn);
    return;
  }

  if (typeof target.removeListener === 'function') {
    target.removeListener(event, fn);
    return;
  }

  throw new Error(`Target is not an event emitter.`);
}

export default class WebSocketDuplexStream extends Duplex {

  _ws: WebSocket | NodeWebSocket;
  _buffers: Array<Buffer | string> = [];
  _finished: bool = false;
  _autoClose: bool = true;
  _log: Logger = log;

  get readyState(): number {
    return this._ws.readyState;
  }

  close(code?: number, reason?: string) {
    this._ws.close(code, reason);
  }

  /**
   * Attempt to immediately terminate connection without sending further frames.
   */
  terminate() {
    if (typeof this._ws.terminate === 'function') {
      this._ws.terminate();
      return;
    }

    // fallback to close if we are running under the browser.
    this.close();
  }

  _onError = (err) => {
    let error;
    if (err instanceof Error) {
      error = err;
    } else {
      error = new Error(err.stack || err.message || err.name || err.type);
    }
    this._log.error('Error in websocket stream ', error);
    this.emit('error', error);
    this.emit('close');
  };

  _onClose = () => {
    this._log.info(`Websocket closing`);
    if (!this._finished) {
      const msg = 'WebSocket closed before all writes...';
      this._log.error(msg);
      removeListener(this._ws, 'error', this._onError);
      this.emit('error', new Error(msg));
      this.emit('close');
      return;
    }

    this.once('end', () => this.emit('close'));
    this.push(null);
    this._log.info(`WebSocket closed`);
  };

  constructor(ws: WebSocket | NodeWebSocket, options: { log?: any } = {}) {
    // $FlowFixMe: hard to type this correctly because of how node passes config.
    const opts = Object.assign({
      // WebSockets have native support for utf8 (strings). Any write which is
      // given a string will be sent a string frame instead of being converted
      // into a buffer.
      decodeStrings: false,
    }, options);
    super(opts);

    if (options.log) {
      this._log = options.log;
    }

    this._ws = ws;
    ws.binaryType = 'arraybuffer';
    ws.addEventListener('open', this._pushBuffers);
    ws.addEventListener('error', this._onError);
    ws.addEventListener('close', this._onClose);

    // This should be MessageEvent, but addEventListener() is spec'ed
    // for an Event listener. Specifying Event here means event.data
    // below will fail.
    const onMessage = (event) => {
      // XXX: Should we somehow include flags ???
      let data = event.data;

      if (typeof data === 'string') {
        this._log.info(`Got string message from websocket`);
        this.push(data);
        return;
      }

      if (!Buffer.isBuffer(data)) {
        // $FlowFixMe: https://github.com/facebook/flow/pull/2296
        data = new Buffer(data);
      }

      // $FlowFixMe: see below ...
      this._log.info(`Got binary message from websocket ${data.length} bytes`);
      invariant(Buffer.isBuffer(data));
      // $FlowFixMe: instanceof checks fail for some reason ....
      this.push(data);
    };

    ws.addEventListener('message', onMessage);

    // Because we correctly account for writes (i.e. wait for ws to open) we
    // know that finished means we have called .send for all pending writes.
    this.once('finish', () => {
      this._log.info(`Websocket writing finished`);
      this._finished = true;
      ws.close();
    });
  }

  _read() {
    // no op ... The message handler will do pushes.
  }

  _write(
    buffer: Buffer | string,
    encoding: string,
    callback: (error: ?Error, data?: Buffer | string) => void
  ): boolean {
    const { _ws: ws } = this;

    // Write after close ...
    if (ws.readyState > ws.constructor.OPEN) {
      callback(new Error(`Write on closed or errored websocket connection.`));
      return false;
    }

    // Write during pending connection ...
    if (ws.readyState < ws.constructor.OPEN) {
      this._log.verbose(`Buffering write (connecting)`);
      this._buffers.push(buffer);
      this.once('_pushed', callback);
      return true;
    }

    try {
      this._log.verbose(`Sending ${buffer.length} bytes`);
      ws.send(buffer);
    } catch (err) {
      this._log.error(`Error sending in websocket`, err.stack);
      callback(err);
      return false;
    }
    callback();
    return true;
  }

  _pushBuffers: () => void = () => {
    for (let buffer of this._buffers) {
      this._log.verbose(`Writing pending buffer: ${buffer.length} bytes`);
      this._ws.send(buffer);
    }
    this._buffers.length = 0;
    this.emit('_pushed');
  };
}
