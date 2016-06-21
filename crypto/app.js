/**
 * @flow
 */

import invariant from 'assert';
import { NativeModules } from 'react-native';
const { SLKCrypto } = NativeModules;

/**
 * Requests a number of random bytes.
 */
export function genRandomBytes(numberOfBytes: number): Promise<Buffer> {
  return SLKCrypto.genRandomBytes(numberOfBytes)
    .then((result) => new Buffer(result, 'hex'));
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


const encodingLength = SLKCrypto.EncodingLength;

/**
 * Generate a new Ed25519 key pair.
 */
export function genEd25519KeyPair(): Promise<[string, string]> {
  return SLKCrypto.genEd25519KeyPair();
}

/**
 * Generate the public key for a given Ed25519 secret key.
 */
export function genEd25519PubKeyFromSecret(
  secretKeyHex: string
): Promise<string> {
  invariant(secretKeyHex.length === 2 * encodingLength);
  return SLKCrypto.genEd25519PubKeyFromSecret(secretKeyHex);
}

/**
 * Generate Ed25519 signature
 */
export function genEd25519Sign(
  messageHex: string,
  secretKeyHex: string
): Promise<string> {
  invariant(secretKeyHex.length === 2 * encodingLength);
  return SLKCrypto.genEd25519Sign(messageHex, secretKeyHex);
}

/**
 * Verify Ed25519 signature
 */
export function genEd25519Verify(
  messageHex: string,
  signatureHex: string,
  publicKeyHex: string
): Promise<boolean> {
  invariant(publicKeyHex.length === 2 * encodingLength);
  invariant(signatureHex.length === 4 * encodingLength);
  return SLKCrypto.genEd25519Verify(messageHex, signatureHex, publicKeyHex)
    .then((result) => !!result);
}
