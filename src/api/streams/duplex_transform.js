/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import assert from 'assert';
import { Duplex, PassThrough } from 'stream';
import makeLog from 'log';

const log = makeLog(`api-streams-duplex-transform`);

const EVENT_NAME_CLOSE = `close`;
const EVENT_NAME_DATA = `data`;
const EVENT_NAME_END = `end`;
const EVENT_NAME_ERROR = `error`;
const EVENT_NAME_FINISH = `finish`;

class ClosingPassThrough extends PassThrough {

  constructor(options) {
    super(options);

    let closed = false;

    const maybeClose = () => {
      if (!closed) {
        closed = true;
        this.emit(EVENT_NAME_CLOSE);
      }
    };

    this.once(EVENT_NAME_ERROR, maybeClose);
    this.once(EVENT_NAME_END, maybeClose);
  }
}

// Applies transforms to both directions of a Duplex stream.
export class DuplexTransform extends Duplex {

  // This class can be subclassed, so all members are prefixed with double
  // underscores to make it less likely that subclasses will use the same names.
  __name = ``;

  __readable = null;
  __writable = null;
  __readableTransform = null;
  __writableTransform = null;

  __readableClosed = false;
  __writableClosed = false;
  __readableTransformClosed = false;
  __writableTransformClosed = false;

  __error = null;

  __endEventAllowed = true;
  __finishEventAllowed = false;

  __autoClose = true;

  constructor(readable,
              writable,
              readableTransform,
              writableTransform,
              options = { }) {
    log.debug(`DuplexTransform()`);

    super(options);

    this.__name = this.constructor.name;

    if (`autoClose` in options) {
      this.__autoClose = options.autoClose;
    }

    this.__readable = readable;
    this.__writable = writable || readable;
    this.__readableTransform = readableTransform || new ClosingPassThrough();
    this.__writableTransform = writableTransform || new ClosingPassThrough();

    this.__readable.pipe(this.__readableTransform);
    this.__writableTransform.pipe(this.__writable);

    this.__readable.addListener(EVENT_NAME_END, this.__onReadableEnd);
    this.__readable.addListener(EVENT_NAME_ERROR, this.__onReadableError);
    DuplexTransform.__ensureCloseEvent(this.__name,
                                       this.__readable,
                                       EVENT_NAME_END,
                                       this.__onReadableClose);

    this.__writable.addListener(EVENT_NAME_FINISH, this.__onWritableFinish);
    this.__writable.addListener(EVENT_NAME_ERROR, this.__onWritableError);
    DuplexTransform.__ensureCloseEvent(this.__name,
                                       this.__writable,
                                       EVENT_NAME_FINISH,
                                       this.__onWritableClose);

    this.__readableTransform.addListener(EVENT_NAME_DATA,
                                         this.__onReadableTransformData);
    this.__readableTransform.addListener(EVENT_NAME_END,
                                         this.__onReadableTransformEnd);
    this.__readableTransform.addListener(EVENT_NAME_ERROR,
                                         this.__onReadableTransformError);
    DuplexTransform.__ensureCloseEvent(this.__name,
                                       this.__readableTransform,
                                       EVENT_NAME_END,
                                       this.__onReadableTransformClose);

    this.__writableTransform.addListener(EVENT_NAME_END,
                                         this.__onWritableTransformEnd);
    this.__writableTransform.addListener(EVENT_NAME_ERROR,
                                         this.__onWritableTransformError);
    DuplexTransform.__ensureCloseEvent(this.__name,
                                       this.__writableTransform,
                                       EVENT_NAME_END,
                                       this.__onWritableTransformClose);
  }

  static __ensureCloseEvent(className, emitter, finalEventName, callback) {
    const closeEventName = EVENT_NAME_CLOSE;
    const errorEventName = EVENT_NAME_ERROR;
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
                 `'${closeEventName}' event within ${closeEventTimeoutMS}ms ` +
                 `of the '${eventName}' event`);

        emitter.removeListener(closeEventName, closeEventListener);
        emitter.removeListener(errorEventName, errorEventListener);
        emitter.removeListener(finalEventName, finalEventListener);

        assert(!closed);
        closed = true;

        assert(timeout);
        timeout = null;

        callback();
      }, closeEventTimeoutMS);
    };

    closeEventListener = () => {
      log.debug(`[${className}] ${emitterName} emitted '${closeEventName}' ` +
                `event`);

      emitter.removeListener(closeEventName, closeEventListener);
      emitter.removeListener(errorEventName, errorEventListener);
      emitter.removeListener(finalEventName, finalEventListener);

      assert(!closed);
      closed = true;

      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }

      callback();
    };

    errorEventListener = () => {
      log.debug(`[${className}] ${emitterName} emitted '${errorEventName}' ` +
                `event`);

      emitter.removeListener(errorEventName, errorEventListener);
      emitter.removeListener(finalEventName, finalEventListener);

      waitForCloseEvent(errorEventName);
    };

    finalEventListener = () => {
      log.debug(`[${className}] ${emitterName} emitted '${finalEventName}' ` +
                `event`);

      emitter.removeListener(finalEventName, finalEventListener);

      waitForCloseEvent(finalEventName);
    };

    emitter.addListener(closeEventName, closeEventListener);
    emitter.addListener(errorEventName, errorEventListener);
    emitter.addListener(finalEventName, finalEventListener);
  }

  end(chunk, encoding, callback) {
    log.debug(`[${this.__name}] DuplexTransform.end()`);

    return super.end(chunk, encoding, callback);
  }

  emit(eventName, ...args) {
    switch (eventName) {
    case EVENT_NAME_END:
      if (!this.__endEventAllowed) {
        // Don't allow the 'end' event until later.
        log.debug(`[${this.__name}] Blocked the '${eventName}' event`);
        return;
      }
      assert(!this.__error);
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
        return;
      }
      assert(!this.__error);
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

  _write(data, encoding, callback) {
    if (this.__error) {
      log.warn(`Cannot write due to previous error`);
      callback(this.__error);
      return;
    }

    this.__writableTransform.write(data, encoding, callback);
  }

  __maybeEmitError(error) {
    log.debug(`[${this.__name}] DuplexTransform.__maybeEmitError(` +
              `'${error.toString()}')`);

    if (this.__error) {
      log.warn(`[${this.__name}] Received more than one error`, error);

      assert(!this.__endEventAllowed);
      assert(!this.__finishEventAllowed);

      return;
    }

    this.__endEventAllowed = false;
    this.__finishEventAllowed = false;

    this.__error = error;
    this.emit(EVENT_NAME_ERROR, error);
  }

  __maybeEmitClose() {
    log.debug(`[${this.__name}] DuplexTransform.__maybeEmitClose()`);

    assert(!this.__closed);

    if (this.__autoClose &&
        this.__readableClosed &&
        this.__writableClosed &&
        this.__readableTransformClosed &&
        this.__writableTransformClosed) {
      this.__closed = true;
      process.nextTick(() => {
        log.debug(`[${this.__name}] Emitting '${EVENT_NAME_CLOSE}' event`);
        this.emit(EVENT_NAME_CLOSE);
      });
    }
  }

  __onReadableEnd = () => {
    log.debug(`[${this.__name}] DuplexTransform.__onReadableEnd()`);

    this.__readable.removeListener(EVENT_NAME_END, this.__onReadableEnd);

    // If the pipe is intact then there is nothing we need to do here.
  };

  __onReadableError = (error) => {
    log.debug(`[${this.__name}] DuplexTransform.__onReadableError(` +
              `'${error.toString()}')`);

    this.__readable.removeListener(EVENT_NAME_ERROR, this.__onReadableError);

    this.__maybeEmitError(error);

    // Unpipe |__readable| and let it drain.
    this.__readable.unpipe(this.__readableTransform);
    this.__readable.resume();

    // End |__readableTransform|. If there is no error emitted on
    // |__readableTransform| then this call will eventually end this stream too.
    this.__readableTransform.end();
  };

  __onReadableClose = () => {
    log.debug(`[${this.__name}] DuplexTransform.__onReadableClose()`);

    this.__readable.removeListener(EVENT_NAME_END, this.__onReadableEnd);
    this.__readable.removeListener(EVENT_NAME_ERROR, this.__onReadableError);

    assert(!this.__readableClosed);
    this.__readableClosed = true;

    this.__maybeEmitClose();
  };

  __onReadableTransformData = data => {
    this.push(data);
  };

  __onReadableTransformEnd = () => {
    log.debug(`[${this.__name}] DuplexTransform.__onReadableTransformEnd()`);

    this.__readableTransform.removeListener(EVENT_NAME_DATA,
                                            this.__onReadableTransformData);
    this.__readableTransform.removeListener(EVENT_NAME_END,
                                            this.__onReadableTransformEnd);

    // End this stream.
    this.push(null);
  };

  __onReadableTransformError = (error) => {
    log.debug(`[${this.__name}] DuplexTransform.__onReadableTransformError(` +
              `'${error.toString()}')`);

    this.__readableTransform.removeListener(EVENT_NAME_DATA,
                                            this.__onReadableTransformData);
    this.__readableTransform.removeListener(EVENT_NAME_ERROR,
                                            this.__onReadableTransformError);

    this.__maybeEmitError(error);

    // By emitting an error |__readable| will be automatically unpiped from
    // |__readableTransform|. Just drain both.
    this.__readable.resume();
    this.__readableTransform.resume();

    // End this stream.
    this.push(null);
  };

  __onReadableTransformClose = () => {
    log.debug(`[${this.__name}] DuplexTransform.__onReadableTransformClose()`);

    this.__readableTransform.removeListener(EVENT_NAME_DATA,
                                            this.__onReadableTransformData);
    this.__readableTransform.removeListener(EVENT_NAME_END,
                                            this.__onReadableTransformEnd);
    this.__readableTransform.removeListener(EVENT_NAME_ERROR,
                                            this.__onReadableTransformError);

    assert(!this.__readableTransformClosed);
    this.__readableTransformClosed = true;

    this.__maybeEmitClose();
  };

  __onWritableFinish = () => {
    log.debug(`[${this.__name}] DuplexTransform.__onWritableFinish()`);

    this.__writable.removeListener(EVENT_NAME_FINISH, this.__onWritableFinish);

    if (!this.__error) {
      this.__finishEventAllowed = true;
      this.emit(EVENT_NAME_FINISH);
    }
  };

  __onWritableError = (error) => {
    log.debug(`[${this.__name}] DuplexTransform.__onWritableError(` +
              `'${error.toString()}')`);

    this.__writable.removeListener(EVENT_NAME_ERROR, this.__onWritableError);
    this.__writable.removeListener(EVENT_NAME_FINISH, this.__onWritableFinish);

    // Emitting an error event means that |__writable| is automatically unpiped
    // from |__writableTransform|.

    this.__maybeEmitError(error);

    // Pass the error along to the transform stream.
    this.__writableTransform.emit(EVENT_NAME_ERROR, error);

    // And end both streams.
    this.end();
    this.__writableTransform.end();
  };

  __onWritableClose = () => {
    log.debug(`[${this.__name}] DuplexTransform.__onWritableClose()`);

    this.__writable.removeListener(EVENT_NAME_ERROR, this.__onWritableError);
    this.__writable.removeListener(EVENT_NAME_FINISH, this.__onWritableFinish);

    assert(!this.__writableClosed);
    this.__writableClosed = true;

    this.__maybeEmitClose();
  };

  __onWritableTransformEnd = () => {
    log.debug(`[${this.__name}] DuplexTransform.__onWritableTransformEnd()`);

    this.__writableTransform.removeListener(EVENT_NAME_END,
                                            this.__onWritableTransformEnd);

    // Assuming that |__writable| hasn't emitted an error then
    // |__writableTransform| should still be piped so there's nothing that we
    // need to do here.
  };

  __onWritableTransformError = (error) => {
    log.debug(`[${this.__name}] DuplexTransform.__onWritableTransformError(` +
              `'${error.toString()}')`);

    this.__writableTransform.removeListener(EVENT_NAME_END,
                                            this.__onWritableTransformEnd);
    this.__writableTransform.removeListener(EVENT_NAME_ERROR,
                                            this.__onWritableTransformError);

    // Emitting an error event means that |__writable| is automatically unpiped
    // from |__writableTransform|.

    this.__maybeEmitError(error);

    // End this stream.
    this.end();
  };

  __onWritableTransformClose = () => {
    log.debug(`[${this.__name}] DuplexTransform.__onWritableTransformClose()`);

    this.__writableTransform.removeListener(EVENT_NAME_END,
                                            this.__onWritableTransformEnd);
    this.__writableTransform.removeListener(EVENT_NAME_ERROR,
                                            this.__onWritableTransformError);

    assert(!this.__writableTransformClosed);
    this.__writableTransformClosed = true;

    this.__maybeEmitClose();
  };
}
