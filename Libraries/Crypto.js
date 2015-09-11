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
 */
export function getRandomBytes(numberOfBytes) {
  return new Promise((accept) => {
    let start = Date.now();
    AppCrypto.getRandomBytes(numberOfBytes, function(bytes) {
      let result = new Uint8Array(numberOfBytes);
      for (let i = 0; i < numberOfBytes; i++) {
        result[i] = bytes[i];
      }
      log(`Got ${numberOfBytes} random bytes in ${Date.now() - start} ms`);
      accept(result);
    })
  });
}

export function PBKDF2KeyDerivation(input, salt, rounds = DEFAULT_ROUNDS) {
  return new Promise((accept) => {
    let start = Date.now();
    AppCrypto.PBKDF2KeyDerivation(input, salt, rounds, function(hexString) {
      log(`Generated PBKDF2KeyDerivation (${rounds}) in ${Date.now() - start} ms`);
      accept(hexString);
    })
  });
}
