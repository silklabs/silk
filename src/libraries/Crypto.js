import { AppCrypto } from 'NativeModules';
import createDebug from 'debug';

const log = createDebug('Crypto');

/**
 * This is the number of rounds all clients should be using in their KDF for
 * generating passwords...
 *
 * XXX: Should be a constant in API.
 */
const DEFAULT_ROUNDS = 64000;

/**
 * Requests a number of random bytes from the native layer.
 *
 * This is most useful when a function typically expects a Buffer or TypedArray
 * to provide entropy (window.crypto.getRandomValues).
 *
 * Also supports node-style callback argument. The callback function should be
 * of the form |function callback(error, result) { ... }|.
 *
 * @return {UInt8Array}
 */
export function getRandomBytes(numberOfBytes: number, callback = null): Buffer {
  return new Promise((accept) => {
    let start = Date.now();
    AppCrypto.getRandomBytes(numberOfBytes, function(bytes) {
      /**
       * The native side cannot send typed arrays so it instead sends an array
       * of numbers (which are enforced as UInt8 on the native side) which we
       * can then properly convert into a typed array.
       */
      let result = new Buffer(numberOfBytes);
      for (let i = 0; i < numberOfBytes; i++) {
        result[i] = bytes[i];
      }
      log(`Got ${numberOfBytes} random bytes in ${Date.now() - start} ms`);
      if (callback) {
        // First argument is an error object.
        callback(null, result);
      }
      accept(result);
    });
  });
}

export function PBKDF2KeyDerivation(input, salt, rounds = DEFAULT_ROUNDS) {
  return new Promise((accept) => {
    let start = Date.now();
    /* eslint new-cap:0 */
    AppCrypto.PBKDF2KeyDerivation(input, salt, rounds, function(hexString) {
      log(`Generated PBKDF2KeyDerivation (${rounds}) in ${Date.now() - start} ms`);
      accept(hexString);
    });
  });
}
