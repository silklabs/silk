/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

// It'd be nice if we could import these from Flow's interface
// definitions rather than having to copy them here.

export type ReadableStreamOptions = {
  highWaterMark?: number,
  encoding?: ?string,
  objectMode?: boolean,
};

export type WritableStreamOptions = {
  highWaterMark?: number,
  decodeString?: boolean,
  objectMode?: boolean,
};

export type DuplexStreamOptions =
  WritableStreamOptions &
  ReadableStreamOptions & {
    allowHalfOpen?: boolean,
    readableObjectMode?: boolean,
    writableObjectMode?: boolean,
  };

export type TransformCallback = (error: ?Error, data?: Buffer | string) => void;
