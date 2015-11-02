/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import createLog from '../log';
import SessionListenerBase from './session_listener_base';

const log = createLog('normal-session-listener');

export default class NormalSessionListener extends SessionListenerBase {
  constructor() {
    log.debug(`NormalSessionListener()`);

    super();
  }

  _onConnect(socketSession) {
    log.debug(`NormalSessionListener._onConnect()`);

    super._onConnect(socketSession);

    this._send({
      name: `registered`,
    });

    if (this._error) {
      this._sendError(this._error);
    }

    if (this._status) {
      this._sendStatus(this._status);
    }
  }

  _onData(data) {
    log.debug(`NormalSessionListener._onData(%j)`, data);

    log.warn(`Unexpected data from app, disconnecting: %j`, data);
    this._socketSession.skip();
    this.disconnect();
  }

  _onRssiUpdate(rssi) {
    log.debug(`NormalSessionListener._onRssiUpdate(${rssi})`);

    // Ignore.
  }
}
