/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import ClosingTransform from './closing_transform';
import DuplexTransform from './duplex_transform';
import makeLog from 'silk-log';

const log = makeLog(`streams:json`);

export class JSONDecodeStream extends ClosingTransform {
  constructor() {
    log.debug(`JSONDecodeStream()`);

    super({
      readableObjectMode: true,
    });
  }

  _transform(chunk, encoding, callback) {
    let data;
    try {
      data = JSON.parse(chunk);
    } catch (err) {
      setImmediate(callback, err);
      return;
    }
    callback(null, data);
  }
}

export class JSONEncodeStream extends ClosingTransform {
  constructor() {
    log.debug(`JSONEncodeStream()`);
    super({
      encoding: 'utf8',
      decodeStrings: false,
      writableObjectMode: true,
    });
  }

  _transform(chunk, encoding, callback) {
    let data;
    try {
      data = JSON.stringify(chunk);
    } catch (err) {
      setImmediate(callback, err);
      return;
    }
    callback(null, data);
  }
}

export class JSONDuplexStream extends DuplexTransform {
  constructor(stream, options = {}) {
    log.debug(`JSONDuplexStream()`);

    const decoder = new JSONDecodeStream();
    const encoder = new JSONEncodeStream();

    options = Object.assign({}, options);
    if (!(`objectMode` in options)) {
      options.objectMode = true;
    }
    if (!(`autoClose` in options)) {
      options.autoClose = true;
    }

    super(stream, stream, decoder, encoder, options);
  }
}
