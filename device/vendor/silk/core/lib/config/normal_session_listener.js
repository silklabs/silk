/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

import createLog from '../log';
import SessionListenerBase from './session_listener_base';

const log = createLog('normal-session-listener');

export default class NormalSessionListener extends SessionListenerBase {

  constructor(deviceConfig, socketSession) {
    log.debug(`NormalSessionListener()`);

    super(deviceConfig, socketSession);

    this._send({
      name: `registered`,
      deviceId: this._deviceConfig._deviceId,
    });

    if (this._deviceConfig._sessionErrorCode) {
      this.sendError(this._deviceConfig._sessionErrorCode);
    }

    if (this._deviceConfig._sessionStatus) {
      this.sendStatus(this._deviceConfig._sessionStatus);
    }
  }

  _onData(data) {
    log.warn(`Unexpected data from app, disconnecting`, data);

    // Don't allow this peripheral to get connected again.
    this._socketSession.skip();
    this.disconnect();
  }

  _onRssiUpdate(/* rssi */) {
    log.warn(`Unexpected rssi update, disconnecting`);

    // Don't allow this peripheral to get connected again.
    this._socketSession.skip();
    this.disconnect();
  }
}
