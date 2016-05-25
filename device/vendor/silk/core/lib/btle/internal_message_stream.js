/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import createLog from 'silk-log';
import {
  ClosingPassThrough,
  ClosingTransform,
  DuplexTransform,
} from 'silk-streams';

import {
  isMessage as isInternalMessage,
  validateMessage,
} from './socket_message_utils';

import type {Duplex} from 'stream';

const log = createLog(`btle-internal-message-stream`);

class InterrnalMessageReadTransform extends ClosingTransform {
  _transform(
    message: Object,
    encoding: string,
    callback: (error: ?Error, data?: Object) => void,
  ): void {
    if (isInternalMessage(message)) {
      log.debug(`Received internal message`, message);
      validateMessage.in(message);

      process.nextTick(() => this.emit(`internalMessage`, message));
      callback(null);
      return;
    }
    callback(null, message);
  }
}

export default class InternalMessageFilterStream extends DuplexTransform {

  _writerPassThrough: ClosingPassThrough;

  constructor(stream: Duplex) {
    const options = {
      objectMode: true,
    };

    const reader = new InterrnalMessageReadTransform(options);
    const writer = new ClosingPassThrough(options);

    super(stream, stream, reader, writer, options);

    reader.addListener(`internalMessage`, (message) => {
      this.emit(`internalMessage`, message);
    });

    this._writerPassThrough = writer;
  }

  _write(
    message: Object,
    encoding: string,
    callback: (error: ?Error, data?: Object) => void,
  ): void {
    if (isInternalMessage(message)) {
      log.error(`Internal message not allowed`, message);

      const error =
        new Error(`Not allowed to write() internal messages, use ` +
                  `writeInternal()`);
      callback(error);
      return;
    }

    super._write(message, encoding, callback);
  }

  writeInternal(message: Object, ...args: Array<any>): boolean {
    log.debug(`Sending internal message`, message);
    validateMessage.out(message);

    return this._writerPassThrough.write(message, ...args);
  }
}
