/**
 * @flow
 */

import crypto from 'crypto';

export function sha256(data: ?string): string {
  let hasher = crypto.createHash('sha256');
  hasher.update(data || '');
  return hasher.digest('hex');
}
