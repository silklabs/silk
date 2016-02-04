/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import invariant from 'assert';
import Metric from '../metric';
import MetricTypes from '../metric_types';

export class Encrypt extends Metric {

  static NAME = `stream_encrypt`;
  static DESC = `Rate for encryption`;

  constructor(bytes: number,
              durationMs: number) {
    invariant(bytes >= 0, `Invalid bytes ${bytes}`);
    invariant(durationMs >= 0, `Invalid duration ${durationMs}`);
    super({
      bytes: new MetricTypes.Integer(bytes),
      durationMs: new MetricTypes.Integer(durationMs),
    });
  }

}

export class Decrypt extends Metric {

  static NAME = `stream_decrypt`;
  static DESC = `Rate for decryption`;

  constructor(bytes: number,
              durationMs: number) {
    invariant(bytes >= 0, `Invalid bytes ${bytes}`);
    invariant(durationMs >= 0, `Invalid duration ${durationMs}`);
    super({
      bytes: new MetricTypes.Integer(bytes),
      durationMs: new MetricTypes.Integer(durationMs),
    });
  }

}

export class CryptoKeyPair extends Metric {

  static NAME = `stream_crypto_keypair`;
  static DESC = `Time taken to generate a key pair`;

  constructor(durationMs: number) {
    invariant(durationMs >= 0, `Invalid duration ${durationMs}`);
    super({
      durationMs: new MetricTypes.Integer(durationMs),
    });
  }

}

export class AuthFailure extends Metric {

  static NAME = `stream_authenticate_verify_failure`;
  static DESC = `Counter for the number of times that authentication fails`;
  static INDEX = new Set([`errorMessage`]);

  constructor(errorMessage: string) {
    invariant(errorMessage, `Empty error message`);
    super({
      count: new MetricTypes.Integer(1),
      errorMessage,
    });
  }

}
