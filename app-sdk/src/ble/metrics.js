/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import invariant from 'assert';
import {Metric, MetricTypes} from 'silk-api';

export class ForceDisconnect extends Metric {

  static NAME = `btle_socket_session_force_disconnect`;
  static DESC =
    `A counter for the number of times a connection is forcefully closed`;

  constructor() {
    super({
      count: new MetricTypes.Integer(1),
    });
  }

}


class SocketSessionBase extends Metric {

  static INDEX = new Set([`status`]);

  constructor(durationMs: number,
              receivedBytes: number,
              sentBytes: number,
              status: string,
              errorMessage: string = ``) {
    invariant(durationMs >= 0, `Invalid duration ${durationMs}`);
    invariant(receivedBytes >= 0, `Invalid received ${receivedBytes}`);
    invariant(sentBytes >= 0, `Invalid sent ${sentBytes}`);

    super({
      durationMs: new MetricTypes.Integer(durationMs),
      receivedBytes: new MetricTypes.Integer(receivedBytes),
      sentBytes: new MetricTypes.Integer(sentBytes),
      status,
      errorMessage,
    });
  }

}

export class SocketSession extends SocketSessionBase {

  static NAME = `btle_socket_session`;
  static DESC = `Information about each socket session`;

  constructor(durationMs: number,
              receivedBytes: number,
              sentBytes: number,
              status: string) {
    super(durationMs, receivedBytes, sentBytes, status);
  }

}

export class SocketSessionError extends SocketSessionBase {

  static NAME = `btle_socket_session_error`;
  static DESC =
    `Information about each socket session that failed due to an error`;
  static INDEX = new Set([`errorMessage`, ...SocketSessionBase.INDEX]);

  constructor(durationMs: number,
              receivedBytes: number,
              sentBytes: number,
              status: string,
              errorMessage: string) {
    invariant(errorMessage, `Empty error message`);

    super(durationMs, receivedBytes, sentBytes, status, errorMessage);
  }

}
