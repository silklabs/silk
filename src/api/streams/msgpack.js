/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import { DuplexTransform } from './duplex_transform';
import makeLog from 'log';
import msgpack from 'msgpack-lite';
import { Transform } from 'stream';

const log = makeLog(`api-streams-msgpack`);

// Hook the 'end' event so that we can emit 'close'.
export class MessagePackDecodeStream extends msgpack.createDecodeStream {
  constructor() {
    log.debug(`MessagePackDecodeStream()`);

    super({
      readableObjectMode: true,
    });

    this.once(`end`, () => this.emit(`close`));
  }
}

// The built-in MessagePack encode stream uses buffers and there's no clean way
// to disable that behavior. This stream encodes without buffering.
export class MessagePackEncodeStream extends Transform {
  constructor() {
    log.debug(`MessagePackEncodeStream()`);

    super({
      writableObjectMode: true,
    });

    this.once(`end`, () => this.emit(`close`));
  }

  _transform(chunk, encoding, callback) {
    callback(null, msgpack.encode(chunk));
  }
}

export class MessagePackDuplexStream extends DuplexTransform {
  constructor(stream, options = { }) {
    log.debug(`MessagePackDuplexStream()`);

    const decoder = new MessagePackDecodeStream();
    const encoder = new MessagePackEncodeStream();

    options = Object.assign({ }, options);
    if (!(`objectMode` in options)) {
      options.objectMode = true;
    }
    if (!(`autoClose` in options)) {
      options.autoClose = true;
    }

    super(stream, stream, decoder, encoder, options);
  }
}
