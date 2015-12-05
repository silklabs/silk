/* @flow */
import crypto from 'crypto';
export default function (buf: Buffer|string): string {
  let hash = crypto.createHash('sha256').update(buf);
  if (!hash) {
    throw new Error('Unknown error while creating sha256');
  }
  return hash.digest('hex');
}
