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

import { Duplex } from 'stream';
import createLog from 'silk-log';

import type { Logger } from 'silk-log';

const log = createLog('streams:websocket');

function removeListener(target: any, event: string, fn: Function): void {
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

  _ws: WebSocket;
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

  _onError: () => void = (err) => {
    let error;
    if (err instanceof Error) {
      error = err;
    } else {
      error = new Error(err.stack || err.message || err.name || err.type);
    }
    this._log.error('Error in websocket stream: ',
                    error.message,
                    error.stack);
    this.emit('error', error);
    this.emit('close');
  };

  _onClose: () => void = () => {
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

  constructor(ws: WebSocket, options: Object = {}) {
    super(options);

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
    const onMessage = (event: any) => {
      // XXX: Should we somehow include flags ???
      let data = event.data;
      if (!Buffer.isBuffer(data)) {
        data = new Buffer(data);
      }

      this._log.info(`Got data from websocket ${data.length} bytes`);
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
    this.emit('_pushed');
  };
}
