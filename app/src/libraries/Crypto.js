/**
 * @flow
 */

import { NativeModules } from 'react-native';
const { SLKCrypto } = NativeModules;

/**
 * Requests a number of random bytes from the native layer.
 *
 * This is most useful when a function typically expects a Buffer or TypedArray
 * to provide entropy (window.crypto.getRandomValues).
 *
 * Also supports node-style callback argument. The callback function should be
 * of the form |function callback(error, result) { ... }|.
 */
export function genRandomBytes(
  numberOfBytes: number,
  callback: ?((error: ?Error, result: ?Buffer) => void) = null
): Promise<Buffer> {
  return SLKCrypto.genRandomBytes(numberOfBytes).catch((error) => {
    if (callback) {
      callback(error);
    }
    throw error;
  }).then((result) => {
    const buffer = new Buffer(result, 'hex');
    if (callback) {
      // First argument is an error object.
      callback(null, buffer);
    }
    return buffer;
  });
}

/**
 * Derive a 256 bit key from a password using PBKDF2 and HMAC-SHA256.
 */
export function genPBKDF2KeyDerivation(
  input: string,
  salt: string,
  rounds: number
): Promise<string> {
  return SLKCrypto.genPBKDF2KeyDerivation(input, salt, rounds);
}
