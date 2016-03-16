/**
 * Wrapper for WebSocket duplex stream. This interface very intentionally sticks
 * to the w3c spec for WebSocket clients rather then the slightly nicer
 * interface offered by ws for node.
 *
 *  - Buffers writes during connect.
 *  - Does not reconnect.
 *
 * @flow
 */

import { Duplex } from 'stream';
import createLog from 'silk-log';

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

export default class WebSocket extends Duplex {

  _ws: WebSocket;
  _buffers: Array<Buffer> = [];
  _finished: bool = false;

  get readyState() {
    return this._ws.readyState;
  }

  _onError = (err) => {
    log.error(`Error in websocket stream: ${err.stack}`);
    this.emit('error', err);
    this.emit('close');
  };

  _onClose = () => {
    log.info(`Websocket closing`);
    if (!this._finished) {
      const msg = 'WebSocket closed before all writes...';
      log.error(msg);
      removeListener(this._ws, 'error', this._onError);
      this.emit('error', new Error(msg));
      this.emit('close');
      return;
    }

    this.once('end', () => this.emit('close'));
    this.push(null);
    log.info(`WebSocket closed`);
  };

  constructor(ws: WebSocket, options: Object = {}) {
    super(options);

    this._ws = ws;
    ws.binaryType = 'arraybuffer';
    ws.addEventListener('open', this._pushBuffers);
    ws.addEventListener('error', this._onError);
    ws.addEventListener('close', this._onClose);

    ws.addEventListener('message', (event) => {
      // XXX: Should we somehow include flags ???
      let data = event.data;
      if (!Buffer.isBuffer(data)) {
        data = new Buffer(data);
      }

      log.info(`Got data from websocket ${data.length} bytes`);
      this.push(data);
    })

    // Because we correctly account for writes (i.e. wait for ws to open) we
    // know that finished means we have called .send for all pending writes.
    this.once('finish', () => {
      log.info(`Websocket writing finished`);
      this._finished = true;
      ws.close();
    });
  }

  _read() {
    // no op ... The message handler will do pushes.
  }

  _write(buffer: Buffer, encoding: string, callback: Function) {
    const { _ws: ws } = this;

    // Write after close ...
    if (ws.readyState > ws.constructor.OPEN) {
      callback(new Error(`Write on closed or errored websocket connection.`));
      return;
    }

    // Write during pending connection ...
    if (ws.readyState < ws.constructor.OPEN) {
      log.verbose(`Buffering write (connecting)`);
      this._buffers.push(buffer);
      this.once('_pushed', callback);
      return;
    }

    try {
      log.verbose(`Sending ${buffer.length} bytes`);
      ws.send(buffer);
    } catch (err) {
      log.error(`Error sending in websocket`, err.stack);
      callback(err);
      return;
    }
    callback();
  }

  _pushBuffers = () => {
    for (let buffer of this._buffers) {
      log.verbose(`Writing pending buffer: ${buffer.length} bytes`);
      this._ws.send(buffer);
    }
    this.emit('_pushed');
  };
}
