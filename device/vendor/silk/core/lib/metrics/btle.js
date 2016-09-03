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

export class ChildProcessCrash extends Metric {

  static NAME = `btle_child_crash`;
  static DESC = `A counter for btle child process crashes`;
  static INDEX = new Set([`code`, `signal`]);

  constructor(code: ?number, signal: ?string) {
    if (code === null) {
      invariant(signal);
    } else {
      invariant(code);
      invariant(code !== 0);
      invariant(signal === null);
    }
    super({
      count: new MetricTypes.Integer(1),
      code: String(code || 0),
      signal: signal || ``,
    });
  }

}

export class BledroidCrash extends Metric {

  static NAME = `btle_bledroid_crash`;
  static DESC = `A counter for bledroid crashes`;

  constructor() {
    super({
      count: new MetricTypes.Integer(1),
    });
  }

}

export class StreamSubscribeFailure extends Metric {

  static NAME = `btle_stream_subscribe_failure`;
  static DESC = `A counter for failing to subscribe (not including timeout)`;

  constructor() {
    super({
      count: new MetricTypes.Integer(1),
    });
  }

}

export class StreamWrite extends Metric {

  static NAME = `btle_stream_write`;
  static DESC = `The amount of time required to write bytes over BTLE`;

  constructor(durationMs: number,
              bytesWritten: number) {
    invariant(durationMs >= 0, `Invalid duration ${durationMs}`);
    invariant(bytesWritten >= 0, `Invalid bytes written ${bytesWritten}`);
    super({
      durationMs: new MetricTypes.Integer(durationMs),
      bytesWritten: new MetricTypes.Integer(bytesWritten),
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

export class SocketSessionFlatline extends SocketSessionBase {

  static NAME = `btle_socket_session_flatline`;
  static DESC = `Information about each socket session that flatlined`;

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
