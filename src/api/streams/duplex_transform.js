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

// Applies transforms to both directions of a Duplex stream.
export class DuplexTransform extends Duplex {
  // This class can be subclassed, so all members are prefixed with double
  // underscores to make it less likely that subclasses will use the same names.
  __readable = null;
  __writable = null;
  __readTransform = null;
  __writeTransform = null;

  __ended = false;
  __finished = false;

  constructor(readable, writable, readTransform, writeTransform, options) {
    log.debug(`DuplexTransform()`);

    super(options);

    this.__readable = readable;
    this.__readable.addListener(`error`, this.__onReadError);

    this.__writable = writable || readable;
    this.__writable.addListener(`error`, this.__onWriteError);

    this.__readTransform = readTransform || new PassThrough();
    this.__readTransform.addListener(`error`, this.__onReadError);
    this.__readTransform.addListener(`data`, this.__onReadTransformData);
    this.__readTransform.addListener(`end`, this.__onReadTransformEnd);

    this.__writeTransform = writeTransform || new PassThrough();
    this.__writeTransform.addListener(`error`, this.__onWriteError);

    this.once(`end`, () => this.__onEnd());
    this.once(`finish`, () => this.__onFinish());

    this.__readable.pipe(this.__readTransform);
    this.__writeTransform.pipe(this.__writable);
  }

  _read() {
    // There's nothing we need to do here. Data gets pushed in
    // |__onReadTransformData()|.
  }

  _write(data, encoding, callback) {
    try {
      this.__writeTransform.write(data, encoding, callback);
    } catch(error) {
      callback(error);
    }
  }

  __onReadError = error => {
    this.emit(`error`, error);
  };

  __onReadTransformData = data => {
    this.push(data);
  };

  __onReadTransformEnd = () => {
    this.__readable.removeListener(`error`, this.__onReadError);
    this.__readTransform.removeListener(`error`, this.__onReadError);
    this.__readTransform.removeListener(`data`, this.__onReadTransformData);
    this.__readTransform.removeListener(`end`, this.__onReadTransformEnd);

    this.push(null);
  };

  __onWriteError = error => {
    this.emit(`error`, error);
  };

  __onEnd = () => {
    log.debug(`DuplexTransform.__onEnd()`);

    assert(!this.__ended);
    this.__ended = true;

    this.__readable = null;
    this.__readTransform = null;

    if (this.__finished) {
      this.emit(`close`);
    }
  };

  __onFinish = () => {
    log.debug(`DuplexTransform.__onFinish()`);

    this.__writable.removeListener(`error`, this.__onWriteError);
    this.__writeTransform.removeListener(`error`, this.__onWriteError);

    this.__writable.once(`finish`, () => {
      log.debug(`DuplexTransform.__writable.__onFinish()`);

      assert(!this.__finished);
      this.__finished = true;

      this.__writable = null;
      this.__writeTransform = null;

      if (this.__ended) {
        this.emit(`close`);
      }
    });

    this.__writeTransform.end();
  };
}
