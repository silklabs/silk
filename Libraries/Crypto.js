import { AppCrypto } from 'NativeModules';
let n = require('NativeModules');

/**
 * Requests a number of random bytes from the native layer.
 */
export function getRandomBytes(numberOfBytes) {
  return new Promise((accept) => {
    AppCrypto.getRandomBytes(numberOfBytes, function(bytes) {
      let result = new Uint8Array(numberOfBytes);
      for (let i = 0; i < numberOfBytes; i++) {
        result[i] = bytes[i];
      }
      accept(result);
    })
  });
}
