/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import invariant from 'assert';
import createLog from 'silk-log';
import {Duplex} from 'stream';

import type {Socket} from 'net';

const log = createLog(`streams-socket`);

const EVENT_NAME_CLOSE = `close`;
const EVENT_NAME_DATA = `data`;
const EVENT_NAME_DRAIN = `drain`;
const EVENT_NAME_END = `end`;
const EVENT_NAME_ERROR = `error`;
const EVENT_NAME_FINISH = `finish`;

export class SocketStream extends Duplex {

  __socket: Socket;

  __streamClosed: boolean = false;
  __streamError: boolean = false;
  __streamEnded: boolean = false;
  __streamFinished: boolean = false;

  __socketClosed: boolean = false;
  __socketError: boolean = false;
  __socketFinished: boolean = false;
  __socketFinishing: boolean = false;
  __socketEnded: boolean = false;
  __socketPaused: boolean = false;

  constructor(socket: Socket, options: any = {}) {
    log.debug(`constructor`);

    invariant(socket);

    options = Object.assign({}, options);

    super(options);

    socket.addListener(EVENT_NAME_CLOSE, this.__onSocketClose);
    socket.addListener(EVENT_NAME_DATA, this.__onSocketData);
    socket.addListener(EVENT_NAME_END, this.__onSocketEnd);
    socket.addListener(EVENT_NAME_ERROR, this.__onSocketError);
    socket.addListener(EVENT_NAME_FINISH, this.__onSocketFinish);

    if (socket.isPaused()) {
      socket.resume();
    }

    this.__socket = socket;
  }

  __maybeClose: (() => void) = () => {
    log.debug(`__maybeClose`);

    if (this.__streamClosed || !this.__socketClosed) {
      return;
    }

    if (!this.__streamError &&
        (!this.__streamEnded || !this.__streamFinished)) {
      return;
    }

    this.__streamClosed = true;

    log.debug(`Scheduling close event`);

    process.nextTick(() => {
      log.debug(`Emitting close event`);
      this.__socket.destroy();

      this.__socket.removeListener(EVENT_NAME_CLOSE, this.__onSocketClose);
      this.__socket.removeListener(EVENT_NAME_END, this.__onSocketEnd);
      this.__socket.removeListener(EVENT_NAME_ERROR, this.__onSocketError);
      this.__socket.removeListener(EVENT_NAME_FINISH, this.__onSocketFinish);

      this.emit(EVENT_NAME_CLOSE);
    });
  };

  _read(size: number): void {
    if (this.__socketPaused) {
      log.info(`Resuming socket reads`);
      this.__socketPaused = false;
      this.__socket.resume();
    }

    // Nothing to push here as data is pushed automatically in __onSocketData.
  }

  _write(
    chunk: Buffer | string,
    encoding: string,
    callback: ((error: ?Error, data?: Buffer) => void)
  ): boolean {
    invariant(Buffer.isBuffer(chunk));

    if (this.__socket.write(chunk, encoding)) {
      callback(null);
      // XXX This return value is bogus but Flow is convinced it has to be a
      //     boolean.
      return true;
    }

    log.warn(`Socket full, pausing socket writes`);

    this.__socket.once(EVENT_NAME_DRAIN, () => {
      log.info(`Resuming socket writes`);
      callback(null);
    });
    return false;
  }

  __onSocketClose: ((hadError: boolean) => void) = (hadError) => {
    log.debug(`__onSocketClose`, hadError);

    invariant(!this.__socketClosed);
    this.__socketClosed = true;

    this.__maybeClose();
  };

  __onSocketData: ((data: Buffer) => void) = (data) => {
    log.debug(`__onSocketData <Buffer %d>`, data.length);

    invariant(!this.__socketPaused);

    if (!this.push(data)) {
      log.warn(`Stream full, pausing socket reads`);
      this.__socketPaused = true;
      this.__socket.pause();
    }
  };

  __onSocketEnd: (() => void) = () => {
    log.debug(`__onSocketEnd`);

    invariant(!this.__socketEnded);
    this.__socketEnded = true;

    this.push(null);
  };

  __onSocketError: ((error: Error) => void) = (error) => {
    log.debug(`__onSocketError`, error);

    invariant(!this.__socketError);
    this.__socketError = true;

    this.emit(EVENT_NAME_ERROR, error);
  };

  __onSocketFinish: (() => void) = () => {
    log.debug(`__onSocketFinish`);

    invariant(!this.__socketFinished);
    this.__socketFinished = true;

    // Socket implementation can call `end()` internally without us seeing it
    // so can't assert here.
    this.__socketFinishing = true;

    this.emit(EVENT_NAME_FINISH);
  };

  emit(event: string, ...args: Array<any>): boolean {
    const ret = this.listenerCount(event) !== 0;

    switch (event) {
    case EVENT_NAME_END: {
      if (this.__streamError) {
        log.warn(`Blocking '${EVENT_NAME_END}' event due to previous error`);
        return ret;
      }

      invariant(this.__socketEnded);

      if (this.__streamEnded) {
        log.error(`Blocking multiple '${EVENT_NAME_END}' events`);
        return ret;
      }
      this.__streamEnded = true;

      invariant(!this.__streamClosed);

      if (this.__streamFinished && !this.__socketClosed) {
        log.debug(`Stream finished then ended, destroying socket`);
        invariant(this.__socketError ||
                  (this.__socketEnded && this.__socketFinished));
        this.__socket.destroy();
      }

      process.nextTick(this.__maybeClose);
      break;
    }

    case EVENT_NAME_FINISH: {
      if (this.__streamError) {
        log.warn(`Blocking '${EVENT_NAME_FINISH}' event due to previous error`);
        return ret;
      }

      if (this.__streamFinished) {
        log.error(`Blocking multiple '${EVENT_NAME_FINISH}' events`);
        return ret;
      }

      // This stream won't be finished until the socket is finished.
      if (!this.__socketFinished) {
        if (!this.__socketFinishing) {
          log.debug(`Stream finished, ending socket`);
          this.__socketFinishing = true;
          this.__socket.end();
        }
        return ret;
      }
      this.__streamFinished = true;

      invariant(!this.__streamClosed);

      if (this.__streamEnded && !this.__socketClosed) {
        log.debug(`Stream ended then finished, destroying socket`);
        invariant(this.__socketError ||
                  (this.__socketEnded && this.__socketFinished));
        this.__socket.destroy();
      }

      process.nextTick(this.__maybeClose);
      break;
    }

    case EVENT_NAME_ERROR: {
      if (this.__streamError) {
        log.error(`Blocking multiple '${EVENT_NAME_ERROR}' events`, args[0]);
        return ret;
      }
      this.__streamError = true;

      invariant(!this.__streamClosed);

      process.nextTick(() => {
        this.push(null);
        this.__maybeClose();
      });
      break;
    }

    default:
      break;
    }

    return super.emit(event, ...args);
  }

}
