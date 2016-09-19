/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import invariant from 'assert';
import makeLog from 'silk-log';
import { Duplex } from 'stream';

import ClosingPassThrough from './closing_passthrough';

import type { Readable, Writable, Transform } from 'stream';
import type { DuplexStreamOptions } from './types';

const log = makeLog(`streams:duplex-transform`);

const EVENT_NAME_CLOSE = `close`;
const EVENT_NAME_DATA = `data`;
const EVENT_NAME_END = `end`;
const EVENT_NAME_ERROR = `error`;
const EVENT_NAME_FINISH = `finish`;

// Applies transforms to both directions of a Duplex stream.
export default class DuplexTransform extends Duplex {

  // Tell Flow that the |emit| method can be hooked.
  emit: (event: string, ...args:Array<any>) => boolean;

  // Tell Flow that the |write| method can be hooked.
  write: (
    chunk: string | Buffer | Object,
    encodingOrCallback?: string | Function,
    callback?: Function
  ) => boolean;

  // This class can be subclassed, so all members are prefixed with double
  // underscores to make it less likely that subclasses will use the same names.
  __name: string = ``;

  __closed: boolean = false;

  __readable: Readable;
  __writable: Writable | Duplex;
  __readableTransform: Transform;
  __writableTransform: Transform;

  __readableClosed: boolean = false;
  __writableClosed: boolean = false;
  __readableTransformClosed: boolean = false;
  __writableTransformClosed: boolean = false;

  __error: ?Error = null;
  __errorEmitted: boolean = false;

  __endEventAllowed: boolean = true;
  __finishEventAllowed: boolean = false;

  __autoClose: boolean = true;

  constructor(
    readable: Readable | Duplex,
    writable: Writable | Duplex,
    readableTransform: ?Transform,
    writableTransform: ?Transform,
    options: DuplexStreamOptions = {}
  ) {
    log.debug(`DuplexTransform()`);

    options = Object.assign({}, options);

    super(options);

    this.__name = this.constructor.name;

    if (`autoClose` in options) {
      this.__autoClose = options.autoClose;
    }

    if (!writable) {
      invariant(readable instanceof Duplex);
      writable = readable;
    }
    this.__readable = readable;
    this.__writable = writable;
    this.__readableTransform = readableTransform ||
                               new ClosingPassThrough(options);
    this.__writableTransform = writableTransform ||
                               new ClosingPassThrough(options);

    this.addListener(EVENT_NAME_ERROR, this.__onError);
    this.once(EVENT_NAME_CLOSE, () => {
      this.removeListener(EVENT_NAME_ERROR, this.__onError);
    });

    DuplexTransform.__ensureCloseEvent(this.__name,
                                       this.__readable,
                                       EVENT_NAME_END,
                                       this.__onReadableClose);
    DuplexTransform.__ensureCloseEvent(this.__name,
                                       this.__writable,
                                       EVENT_NAME_FINISH,
                                       this.__onWritableClose);
    DuplexTransform.__ensureCloseEvent(this.__name,
                                       this.__readableTransform,
                                       EVENT_NAME_END,
                                       this.__onReadableTransformClose);
    DuplexTransform.__ensureCloseEvent(this.__name,
                                       this.__writableTransform,
                                       EVENT_NAME_END,
                                       this.__onWritableTransformClose);

    this.__readable.addListener(EVENT_NAME_END, this.__onReadableEnd);
    this.__readable.addListener(EVENT_NAME_ERROR, this.__onReadableError);

    this.__writable.addListener(EVENT_NAME_ERROR, this.__onWritableError);
    this.__writable.addListener(EVENT_NAME_FINISH, this.__onWritableFinish);

    this.__readableTransform.addListener(EVENT_NAME_DATA,
                                         this.__onReadableTransformData);
    this.__readableTransform.addListener(EVENT_NAME_END,
                                         this.__onReadableTransformEnd);
    this.__readableTransform.addListener(EVENT_NAME_ERROR,
                                         this.__onReadableTransformError);

    this.__writableTransform.addListener(EVENT_NAME_END,
                                         this.__onWritableTransformEnd);
    this.__writableTransform.addListener(EVENT_NAME_ERROR,
                                         this.__onWritableTransformError);

    this.__readable.pipe(this.__readableTransform);
    this.__writableTransform.pipe(this.__writable);
  }

  static __ensureCloseEvent(className, emitter, finalEventName, callback) {
    const closeEventTimeoutMS = 5000;
    const emitterName = emitter.constructor.name;

    let closed = false;
    let timeout = null;

    let closeEventListener;
    let errorEventListener;
    let finalEventListener;

    const waitForCloseEvent = (eventName) => {
      if (closed || timeout) {
        return;
      }

      timeout = setTimeout(() => {
        log.warn(`[${className}] '${emitterName}' instance did not emit a ` +
                 `'${EVENT_NAME_CLOSE}' event within ` +
                 `${closeEventTimeoutMS}ms of the '${eventName}' event`);

        emitter.removeListener(EVENT_NAME_CLOSE, closeEventListener);
        emitter.removeListener(EVENT_NAME_ERROR, errorEventListener);
        emitter.removeListener(finalEventName, finalEventListener);

        invariant(!closed);
        closed = true;

        invariant(timeout);
        timeout = null;

        callback();
      }, closeEventTimeoutMS);
    };

    closeEventListener = () => {
      log.debug(`[${className}] ${emitterName} emitted '${EVENT_NAME_CLOSE}' ` +
                `event`);

      emitter.removeListener(EVENT_NAME_CLOSE, closeEventListener);
      emitter.removeListener(EVENT_NAME_ERROR, errorEventListener);
      emitter.removeListener(finalEventName, finalEventListener);

      invariant(!closed);
      closed = true;

      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }

      callback();
    };

    errorEventListener = () => {
      log.debug(`[${className}] ${emitterName} emitted '${EVENT_NAME_ERROR}' ` +
                `event`);

      emitter.removeListener(EVENT_NAME_ERROR, errorEventListener);
      emitter.removeListener(finalEventName, finalEventListener);

      waitForCloseEvent(EVENT_NAME_ERROR);
    };

    finalEventListener = () => {
      log.debug(`[${className}] ${emitterName} emitted '${finalEventName}' ` +
                `event`);

      emitter.removeListener(finalEventName, finalEventListener);

      waitForCloseEvent(finalEventName);
    };

    emitter.addListener(EVENT_NAME_CLOSE, closeEventListener);
    emitter.addListener(EVENT_NAME_ERROR, errorEventListener);
    emitter.addListener(finalEventName, finalEventListener);
  }

  end(
    chunk?: any, // would love to use generics here, but Flow is too anal
    encodingOrCallback?: string | Function,
    callback?: Function
  ) {
    log.debug(`[${this.__name}] DuplexTransform.end()`);
    return super.end(chunk, encodingOrCallback, callback);
  }

  emit(eventName: string, ...args: Array<any>): boolean {
    const ret = this.listenerCount(eventName) !== 0;

    switch (eventName) {
    case EVENT_NAME_END:
      if (!this.__endEventAllowed) {
        // Don't allow the 'end' event until later.
        log.debug(`[${this.__name}] Blocked the '${eventName}' event`);
        return ret;
      }
      invariant(!this.__error);
      log.debug(`[${this.__name}] Emitting the '${eventName}' event`);
      break;

    case EVENT_NAME_FINISH:
      if (!this.__finishEventAllowed) {
        // Don't allow the 'finish' event until later.
        log.debug(`[${this.__name}] Blocked the '${eventName}' event`);

        if (!this.__error) {
          log.debug(`[${this.__name}] Ending the ` +
                    `${this.__writableTransform.constructor.name} stream`);
          this.__writableTransform.end();
        }
        return ret;
      }
      invariant(!this.__error);
      log.debug(`[${this.__name}] Emitting the '${eventName}' event`);
      break;

    case EVENT_NAME_ERROR:
      if (this.__errorEmitted) {
        log.warn(`[${this.__name}] Blocked multiple '${eventName}' events`,
                 args[0]);
        return ret;
      }
      this.__errorEmitted = true;
      break;

    default:
      break;
    }

    return super.emit(eventName, ...args);
  }

  _read() {
    // There's nothing we need to do here. Data gets pushed in
    // |__onReadTransformData()|.
  }

  _write(
    chunk: any, // would love to use generics here, but Flow is too anal
    encoding: string,
    callback: (error: ?Error, data?: any) => void
  ): boolean {
    if (this.__error) {
      log.warn(`Cannot write due to previous error`);
      callback(this.__error);
      return false;
    }

    return this.__writableTransform.write(chunk, encoding, callback);
  }

  __onError: ((error: Error) => void) = (error) => {
    log.debug(`[${this.__name}] DuplexTransform.__onError(` +
              `'${error.toString()}')`);

    this.__cleanupAfterError(error);
  };

  __cleanupAfterError(error: Error) {
    log.debug(`[${this.__name}] DuplexTransform.__cleanupAfterError(` +
              `'${error.toString()}')`);

    if (this.__error) {
      invariant(!this.__endEventAllowed);
      invariant(!this.__finishEventAllowed);
      return;
    }

    this.__error = error;
    this.__endEventAllowed = false;
    this.__finishEventAllowed = false;

    this.removeListener(EVENT_NAME_ERROR, this.__onError);

    // Remove all event listeners.
    this.__readable.removeListener(EVENT_NAME_END, this.__onReadableEnd);
    this.__readable.removeListener(EVENT_NAME_ERROR, this.__onReadableError);
    this.__writable.removeListener(EVENT_NAME_ERROR, this.__onWritableError);
    this.__writable.removeListener(EVENT_NAME_FINISH, this.__onWritableFinish);
    this.__readableTransform.removeListener(EVENT_NAME_DATA,
                                            this.__onReadableTransformData);
    this.__readableTransform.removeListener(EVENT_NAME_END,
                                            this.__onReadableTransformEnd);
    this.__readableTransform.removeListener(EVENT_NAME_ERROR,
                                            this.__onReadableTransformError);
    this.__writableTransform.removeListener(EVENT_NAME_END,
                                            this.__onWritableTransformEnd);
    this.__writableTransform.removeListener(EVENT_NAME_ERROR,
                                            this.__onWritableTransformError);

    // Unpipe everything.
    this.__readable.unpipe(this.__readableTransform);
    this.__writableTransform.unpipe(this.__writable);

    // End the transform streams.
    this.__readableTransform.end();
    this.__writableTransform.end();

    // Make sure that the transform streams emit 'end' events.
    this.__readableTransform.resume();
    this.__writableTransform.resume();

    // Tell others about this error now that our internal state is sane.
    this.emit(EVENT_NAME_ERROR, error);

    // End the readable and writable parts of this stream.
    this.push(null);
    this.end();

    // Tell the writable stream that we will not be writing any more data.
    this.__writable.end();

    // And see if we can emit the close event.
    this.__maybeEmitClose();
  }

  __maybeEmitClose() {
    log.debug(`[${this.__name}] DuplexTransform.__maybeEmitClose()`);

    invariant(!this.__closed);

    if (this.__autoClose &&
        this.__readableClosed &&
        this.__writableClosed &&
        this.__readableTransformClosed &&
        this.__writableTransformClosed) {
      log.debug(`[${this.__name}] Scheduling '${EVENT_NAME_CLOSE}' event`);
      this.__closed = true;
      process.nextTick(() => {
        log.debug(`[${this.__name}] Emitting '${EVENT_NAME_CLOSE}' event`);
        this.emit(EVENT_NAME_CLOSE);
      });
    }
  }

  __onReadableEnd: (() => void) = () => {
    log.debug(`[${this.__name}] DuplexTransform.__onReadableEnd()`);

    this.__readable.removeListener(EVENT_NAME_END, this.__onReadableEnd);

    // If the pipe is intact then there is nothing we need to do here.
  };

  __onReadableError: ((error: Error) => void) = (error) => {
    log.debug(`[${this.__name}] DuplexTransform.__onReadableError(` +
              `'${error.toString()}')`);

    this.__cleanupAfterError(error);
  };

  __onReadableClose: (() => void) = () => {
    log.debug(`[${this.__name}] DuplexTransform.__onReadableClose()`);

    this.__readable.removeListener(EVENT_NAME_END, this.__onReadableEnd);
    this.__readable.removeListener(EVENT_NAME_ERROR, this.__onReadableError);

    invariant(!this.__readableClosed);
    this.__readableClosed = true;

    this.__maybeEmitClose();
  };

  __onReadableTransformData: ((data: any) => void) = (data) => {
    invariant(!this.__error);

    this.push(data);
  };

  __onReadableTransformEnd: (() => void) = () => {
    log.debug(`[${this.__name}] DuplexTransform.__onReadableTransformEnd()`);

    this.__readableTransform.removeListener(EVENT_NAME_DATA,
                                            this.__onReadableTransformData);
    this.__readableTransform.removeListener(EVENT_NAME_END,
                                            this.__onReadableTransformEnd);

    // Unpipe.
    this.__readable.unpipe(this.__readableTransform);

    // End this stream.
    this.push(null);
  };

  __onReadableTransformError: (() => void) = (error) => {
    log.debug(`[${this.__name}] DuplexTransform.__onReadableTransformError(` +
              `'${error.toString()}')`);

    this.__cleanupAfterError(error);
  };

  __onReadableTransformClose: (() => void) = () => {
    log.debug(`[${this.__name}] DuplexTransform.__onReadableTransformClose()`);

    this.__readableTransform.removeListener(EVENT_NAME_DATA,
                                            this.__onReadableTransformData);
    this.__readableTransform.removeListener(EVENT_NAME_END,
                                            this.__onReadableTransformEnd);
    this.__readableTransform.removeListener(EVENT_NAME_ERROR,
                                            this.__onReadableTransformError);

    invariant(!this.__readableTransformClosed);
    this.__readableTransformClosed = true;

    this.__maybeEmitClose();
  };

  __onWritableFinish: (() => void) = () => {
    log.debug(`[${this.__name}] DuplexTransform.__onWritableFinish()`);

    this.__writable.removeListener(EVENT_NAME_FINISH, this.__onWritableFinish);

    if (!this.__error) {
      this.__finishEventAllowed = true;
      this.emit(EVENT_NAME_FINISH);
    }
  };

  __onWritableError: (() => void) = (error) => {
    log.debug(`[${this.__name}] DuplexTransform.__onWritableError(` +
              `'${error.toString()}')`);

    this.__cleanupAfterError(error);
  };

  __onWritableClose: (() => void) = () => {
    log.debug(`[${this.__name}] DuplexTransform.__onWritableClose()`);

    this.__writable.removeListener(EVENT_NAME_ERROR, this.__onWritableError);
    this.__writable.removeListener(EVENT_NAME_FINISH, this.__onWritableFinish);

    invariant(!this.__writableClosed);
    this.__writableClosed = true;

    this.__maybeEmitClose();
  };

  __onWritableTransformEnd: (() => void) = () => {
    log.debug(`[${this.__name}] DuplexTransform.__onWritableTransformEnd()`);

    this.__writableTransform.removeListener(EVENT_NAME_END,
                                            this.__onWritableTransformEnd);

    // Assuming that |__writable| hasn't emitted an error then
    // |__writableTransform| should still be piped so there's nothing that we
    // need to do here.
  };

  __onWritableTransformError: ((error: Error) => void) = (error) => {
    log.debug(`[${this.__name}] DuplexTransform.__onWritableTransformError(` +
              `'${error.toString()}')`);

    this.__cleanupAfterError(error);
  };

  __onWritableTransformClose: (() => void) = () => {
    log.debug(`[${this.__name}] DuplexTransform.__onWritableTransformClose()`);

    this.__writableTransform.removeListener(EVENT_NAME_END,
                                            this.__onWritableTransformEnd);
    this.__writableTransform.removeListener(EVENT_NAME_ERROR,
                                            this.__onWritableTransformError);

    invariant(!this.__writableTransformClosed);
    this.__writableTransformClosed = true;

    this.__maybeEmitClose();
  };
}
