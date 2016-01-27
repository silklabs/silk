/**
 * Do nothing for now.
 */

/* eslint-disable consistent-return */

import crypto from 'crypto';
import Crypto from './Crypto';

crypto.randomBytes = function(size, callback) {
  if (callback) {
    Crypto.getRandomBytes(size, callback);
    return;
  }
  // TODO: this is a terrible temporary hack, we should not ship this!
  let result = new Buffer(size);
  for (let i = 0; i < size; i++) {
    result[i] = Math.floor(Math.random() * 256);
  }
  return result;
};
