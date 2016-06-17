/**
 * @flow
 */

import invariant from 'assert';
import { NativeModules } from 'react-native';
import { overrideCryptoSignImplementation } from 'silk-api';

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


/**
 * Ed25519
 */
const encodingLength = SLKCrypto.EncodingLength;

function genKeyPair(): Promise<[string, string]> {
  return SLKCrypto.genEd25519KeyPair();
}

function genPublicKeyFromSecret(
  secretKeyHex: string
): Promise<string> {
  invariant(secretKeyHex.length === 2 * encodingLength);
  return SLKCrypto.genEd25519PubKeyFromSecret(secretKeyHex);
}

function genSign(
  messageHex: string,
  secretKeyHex: string
): Promise<string> {
  invariant(secretKeyHex.length === 2 * encodingLength);
  return SLKCrypto.genEd25519Sign(messageHex, secretKeyHex);
}

function genVerify(
  messageHex: string,
  signatureHex: string,
  publicKeyHex: string
): Promise<boolean> {
  invariant(publicKeyHex.length === 2 * encodingLength);
  invariant(signatureHex.length === 4 * encodingLength);
  return SLKCrypto.genEd25519Verify(messageHex, signatureHex, publicKeyHex)
    .then((result) => !!result);
}

overrideCryptoSignImplementation({
  encodingLength,
  genKeyPair,
  genPublicKeyFromSecret,
  genSign,
  genVerify,
});
