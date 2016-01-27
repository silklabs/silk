/**
 * @flow
 */

import { NativeModules } from 'react-native';
const { AppCrypto } = NativeModules;

/**
 * Requests a number of random bytes from the native layer.
 *
 * This is most useful when a function typically expects a Buffer or TypedArray
 * to provide entropy (window.crypto.getRandomValues).
 *
 * Also supports node-style callback argument. The callback function should be
 * of the form |function callback(error, result) { ... }|.
 */
export function getRandomBytes(
  numberOfBytes: number,
  callback: ?((error: ?Error, result: ?Buffer) => void) = null
): Promise<Buffer> {
  return AppCrypto.getRandomBytes(numberOfBytes).catch((error) => {
    if (callback) {
      callback(error);
    }
    throw error;
  }).then((result) => {
    // The native side cannot send typed arrays so it instead sends a JS array of
    // numbers  which we can then properly convert into a typed array / Buffer.
    let buffer = new Buffer(numberOfBytes);
    for (let i = 0; i < numberOfBytes; i++) {
      buffer[i] = result[i];
    }
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
export function pbkdf2KeyDerivation(
  input: string,
  salt: string,
  rounds: number
): Promise<string> {
  return AppCrypto.pbkdf2KeyDerivation(input, salt, rounds);
}
