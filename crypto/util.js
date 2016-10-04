/**
 * @flow
 */

import invariant from 'assert';

export function toBuffer(bufferOrHexString: string | Buffer): Buffer {
  if (bufferOrHexString instanceof Buffer) {
    return bufferOrHexString;
  }
  invariant(typeof bufferOrHexString === 'string');
  return new Buffer(bufferOrHexString, 'hex');
}

export function toHexString(bufferOrHexString: string | Buffer): string {
  if (typeof bufferOrHexString === 'string') {
    return bufferOrHexString;
  }
  invariant(bufferOrHexString instanceof Buffer);
  return bufferOrHexString.toString('hex');
}
