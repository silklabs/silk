/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import ClosingTransform from './closing_transform';
import { DuplexTransform } from './duplex_transform';
import makeLog from 'log';
import msgpack from 'msgpack-lite';

const EVENT_NAME_CLOSE = `close`;
const EVENT_NAME_END = `end`;
const EVENT_NAME_ERROR = `error`;

const log = makeLog(`api-streams-msgpack`);

// Hook the 'end' event so that we can emit 'close'.
export class MessagePackDecodeStream extends msgpack.createDecodeStream {
  constructor() {
    log.debug(`MessagePackDecodeStream()`);

    super({
      readableObjectMode: true,
    });

    const emitClose = () => {
      this.removeListener(EVENT_NAME_END, emitClose);
      this.removeListener(EVENT_NAME_ERROR, emitClose);

      process.nextTick(() => this.emit(EVENT_NAME_CLOSE));
    };

    this.addListener(EVENT_NAME_END, emitClose);
    this.addListener(EVENT_NAME_ERROR, emitClose);
  }
}

// The built-in MessagePack encode stream uses buffers and there's no clean way
// to disable that behavior. This stream encodes without buffering.
export class MessagePackEncodeStream extends ClosingTransform {
  constructor() {
    log.debug(`MessagePackEncodeStream()`);

    super({
      writableObjectMode: true,
    });
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
