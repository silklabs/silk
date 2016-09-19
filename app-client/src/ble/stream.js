/**
 * @flow
 */

import invariant from 'assert';
import {Duplex} from 'stream';
import makeLog from 'silk-log';

import type {Socket} from 'silk-ble-socket';

const log = makeLog(`btle-stream`);

export default class Stream extends Duplex {

  // Tell Flow that the |write| method can be hooked.
  write: (
    chunk: string | Buffer,
    encodingOrCallback?: string | Function,
    callback?: Function
  ) => boolean;

  _socket: Socket;

  _error: ?Error = null;
  _ended: boolean = false;
  _finished: boolean = false;
  _closed: boolean = false;

  constructor(socket: Socket) {
    log.debug(`constructor`);

    super();

    socket.addListener(`data`, this._onSocketData);
    socket.addListener(`end`, this._onSocketEnd);
    socket.addListener(`disconnect`, this._onSocketDisconnect);

    this._socket = socket;

    this.once(`end`, this._onEnd);
    this.once(`finish`, this._onFinish);
  }

  _read(size: number) {
    // Nothing to do here.
  }

  _write(
    data: Buffer | string,
    encoding: string,
    callback: ((error: ?Error) => void)
  ): boolean {
    log.debug(`_write <Buffer ${data.length}>`);
    invariant(data instanceof Buffer);
    invariant(encoding === `buffer`);

    if (this._error) {
      log.warn(`Cannot write due to previous error`);
      callback(this._error);
      return false;
    }

    this._socket.send(data);

    callback(null);
    return true;
  }

  _maybeScheduleClose(): void {
    log.debug(`_maybeScheduleClose`, {
      closed: this._closed,
      ended: this._ended,
      error: this._error,
      finished: this._finished,
    });

    if (this._closed || !this._ended || !this._finished) {
      return;
    }

    log.debug(`Scheduling 'close' event`);
    this._closed = true;

    process.nextTick(() => {
      log.debug(`Emitting 'close' event`);
      this.emit(`close`);
    });
  }

  _emitError(error: Error) {
    log.debug(`_emitError`, error);

    if (this._error) {
      log.warn(`Received more than one error`, error);
      return;
    }

    this._error = error;
    log.warn(error);

    this._ended = true;
    this._finished = true;

    this.emit(`error`, error);
    this._maybeScheduleClose();
  }

  _onSocketData: ((data: Buffer) => void) = (data) => {
    log.debug(`_onSocketData <Buffer ${data.length}>`);

    this.push(data);
  };

  _onSocketEnd: (() => void) = () => {
    log.debug(`_onSocketEnd`);

    this._socket.removeListener(`end`, this._onSocketEnd);

    this.push(null);
  };

  _onSocketDisconnect: (() => void) = () => {
    log.debug(`_onSocketDisconnect`);

    this._socket.removeListener(`data`, this._onSocketData);
    this._socket.removeListener(`end`, this._onSocketEnd);
    this._socket.removeListener(`disconnect`, this._onSocketDisconnect);

    this.push(null);

    if (!this._finished) {
      this._emitError(new Error(`Other side disconnected unexpectedly`));
    }
  };

  _onEnd: (() => void) = () => {
    log.debug(`_onEnd`);

    if (this._ended) {
      return;
    }
    this._ended = true;

    this._maybeScheduleClose();
  };

  _onFinish: (() => void) = () => {
    log.debug(`_onFinish`);

    if (this._finished) {
      return;
    }
    this._finished = true;

    this._socket.finish();

    this._maybeScheduleClose();
  };

}
