/**
 * @flow
 */

import assert from 'assert';
import { Duplex } from 'stream';
import makeLog from 'log';

import type { Socket } from './SocketManager';

const log = makeLog(`btle-stream`);

export default class Stream extends Duplex {
  _socket: Socket;

  _writeError: ?Error = null;
  _ended: boolean = false;
  _finished: boolean = false;

  constructor(socket: Socket) {
    log.debug(`Stream()`);

    super();

    socket.addListener(`error`, this._onError);
    socket.addListener(`data`, this._onData);
    socket.addListener(`disconnect`, this._onDisconnect);

    this._socket = socket;

    this.once(`end`, () => {
      assert(!this._ended);
      this._ended = true;

      if (this._finished) {
        this.emit(`close`);
      }
    });

    this.once(`finish`, () => {
      assert(!this._finished);
      this._finished = true;

      if (this._ended) {
        this.emit(`close`);
      }
    });
  }

  _read(size: number) {
    // Nothing to do here.
  }

  _write(data: Buffer, encoding: 'buffer', callback: ((error: ?Error) => void)) {
    log.debug(`Stream._write(<Buffer ${data.length}>, ${encoding})`);
    assert(encoding === `buffer`);

    if (!this._writeError) {
      try {
        this._socket.send(data);
      } catch(error) {
        this._setWriteError(error);
      }
    }

    callback(this._writeError);
  }

  _setWriteError(error: Error) {
    log.debug(`Stream._setWriteError('${error.toString()}')`);

    if (this._writeError) {
      log.warn(error);
    } else {
      this._writeError = error;
    }
  }

  _onError: ((error: Error) => void) = (error) => {
    log.debug(`Stream._onError('${error.toString()}')`);

    this.emit(`error`, error);
  };

  _onData: ((data: Buffer) => void) = (data) => {
    log.debug(`Stream._onData(<Buffer ${data.length}>)`);

    this.push(data);
  };

  _onDisconnect: (() => void) = () => {
    log.debug(`Stream._onDisconnect()`);

    this._socket.removeListener(`error`, this._onError);
    this._socket.removeListener(`data`, this._onData);
    this._socket.removeListener(`disconnect`, this._onDisconnect);

    let error = new Error(`Other side has disconnected, cannot write`);
    this._setWriteError(error);

    if (!this._finished) {
      error = new Error(`Other side disconnected unexpectedly`);
      this.emit(`error`, error);
    }

    this.push(null);
  };
}
