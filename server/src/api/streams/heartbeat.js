/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import assert from 'assert';
import ClosingPassThrough from './closing_passthrough';
import { DuplexTransform } from './duplex_transform';
import makeLog from 'log';

const log = makeLog(`api-streams-heartbeat`);

const PROPERTY_NAME = `_<3_<3_<3_`;

class HeartbeatStreamBase extends ClosingPassThrough {

  _delay = 0;
  _ending = false;
  _timeout = null;

  constructor(options) {
    log.debug(`HeartbeatStreamBase()`);

    assert(options);
    assert(`delay` in options);

    if (!(`objectMode` in options)) {
      options.objectMode = true;
    }

    super(options);

    this._delay = options.delay;

    if (`autoEnable` in options) {
      this.enabled = options.autoEnable;
    }
  }

  _scheduleTimeout() {
    if (this._ending) {
      log.debug(`Stream ended, not scheduling timeout`);
      return;
    }

    this._timeout = setTimeout(() => this._onTimeout(), this._delay);
  }

  end(chunk, encoding, callback) {
    log.debug(`[${this.constructor.name}] HeartbeatStreamBase.end()`);

    assert(!this._ending);
    this._ending = true;

    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }

    super.end(chunk, encoding, callback);
  }

  get enabled() {
    return !!this._timeout;
  }

  set enabled(val) {
    if (!this._timeout === !val) {
      return;
    }

    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = null;
    } else {
      this._scheduleTimeout();
    }
  }
}

export class HeartbeatReceiverStream extends HeartbeatStreamBase {

  static DEFAULT_TIMEOUT_MS = 5000;

  constructor(options = { }) {
    log.debug(`HeartbeatReceiverStream()`);

    options = Object.assign({ }, options);
    if (!(`delay` in options) || options.delay <= 0) {
      if ((`readableDelay` in options) && options.readableDelay > 0) {
        options.delay = options.readableDelay;
      } else {
        options.delay = HeartbeatReceiverStream.DEFAULT_TIMEOUT_MS;
      }
    }

    super(options);
  }

  _transform(chunk, encoding, callback) {
    if (chunk &&
       (typeof chunk === `object`) &&
       !Buffer.isBuffer(chunk) &&
       (PROPERTY_NAME in chunk) &&
       chunk[PROPERTY_NAME] === null) {
      log.debug(`Received heartbeat`);

      const oldTimeout = this._timeout;
      if (oldTimeout) {
        clearTimeout(this._timeout);
      }

      this.emit(`heartbeat`);

      if (this._timeout === oldTimeout) {
        this._scheduleTimeout();
      }
    } else {
      this.push(chunk);
    }

    callback(null);
  }

  _onTimeout() {
    log.debug(`HeartbeatReceiverStream._onTimeout()`);

    this._timeout = null;

    this.emit(`flatline`);
  }

  resetMonitor() {
    log.debug(`HeartbeatReceiverStream.resetMonitor()`);

    if (this._timeout) {
      clearTimeout(this._timeout);
      this._scheduleTimeout();
    }
  }
}

export class HeartbeatSenderStream extends HeartbeatStreamBase {

  static DEFAULT_TIMEOUT_MS = 1000;

  constructor(options = { }) {
    log.debug(`HeartbeatSenderStream()`);

    options = Object.assign({ }, options);
    if (!(`delay` in options) || options.delay <= 0) {
      if ((`writableDelay` in options) && options.writableDelay > 0) {
        options.delay = options.writableDelay;
      } else {
        options.delay = HeartbeatSenderStream.DEFAULT_TIMEOUT_MS;
      }
    }

    super(options);
  }

  _onTimeout() {
    log.debug(`HeartbeatSenderStream._onTimeout()`);

    assert(!this._ending);

    let msg = { };
    msg[PROPERTY_NAME] = null;
    this.push(msg);

    this._scheduleTimeout();
  }
}

export class HeartbeatDuplexStream extends DuplexTransform {

  __receiver = null;
  __sender = null;

  constructor(stream, options = { }) {
    log.debug(`HeartbeatDuplexStream()`);

    options = Object.assign({ }, options);
    if (!(`objectMode` in options)) {
      options.objectMode = true;
    }

    const receiver = new HeartbeatReceiverStream(options);
    const sender = new HeartbeatSenderStream(options);

    if (!(`autoClose` in options)) {
      options.autoClose = true;
    }

    super(stream, stream, receiver, sender, options);

    receiver.on(`heartbeat`, () => this.emit(`heartbeat`));
    receiver.on(`flatline`, () => this.emit(`flatline`));

    this.__receiver = receiver;
    this.__sender = sender;
  }

  resetMonitor() {
    if (!this.monitorHeartbeats) {
      log.warn(`Not monitoring heartbeats`);
      return;
    }

    this.__receiver.resetMonitor();
  }

  get monitorHeartbeats() {
    return this.__receiver.enabled;
  }

  set monitorHeartbeats(val) {
    this.__receiver.enabled = val;
  }

  get sendHeartbeats() {
    return this.__sender.enabled;
  }

  set sendHeartbeats(val) {
    this.__sender.enabled = val;
  }
}
