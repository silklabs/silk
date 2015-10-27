/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import { Duplex } from 'stream';
import makeLog from 'log';

const log = makeLog(`btle-stream`);

export default class Stream extends Duplex {
  _socket = null;
  _writeError = null;
  _ended = false;
  _finished = false;

  constructor(socket) {
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

  _read(size) {
    // Nothing to do here.
  }

  _write(data, encoding, callback) {
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

  _setWriteError(error) {
    log.debug(`Stream._setWriteError('${error.toString()}')`);

    if (this._writeError) {
      log.warn(error);
    } else {
      this._writeError = error;
    }
  }

  _onError = error => {
    log.debug(`Stream._onError('${error.toString()}')`);

    this.emit(`error`, error);
  };

  _onData = data => {
    log.debug(`Stream._onData(<Buffer ${data.length}>)`);

    this.push(data);
  };

  _onDisconnect = () => {
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
