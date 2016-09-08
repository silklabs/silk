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
  invariant(secretKeyHex.length === 2 * SLKCrypto.crypto_sign_ed25519_SEEDBYTES);
  return SLKCrypto.genEd25519PubKeyFromSecret(secretKeyHex);
}

/**
 * Generate Ed25519 signature
 */
export function genEd25519Sign(
  messageHex: string,
  secretKeyHex: string
): Promise<string> {
  invariant(secretKeyHex.length === 2 * SLKCrypto.crypto_sign_ed25519_SEEDBYTES);
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
  invariant(publicKeyHex.length === 2 * SLKCrypto.crypto_sign_ed25519_PUBLICKEYBYTES);
  invariant(signatureHex.length === 2 * SLKCrypto.crypto_sign_ed25519_BYTES);
  return SLKCrypto.genEd25519Verify(messageHex, signatureHex, publicKeyHex)
    .then((result) => !!result);
}

export const ED25519_KEY_BYTES = SLKCrypto.crypto_sign_ed25519_PUBLICKEYBYTES;
export const ED25519_SIG_BYTES = SLKCrypto.crypto_sign_ed25519_BYTES;


/**
 * Generate a new X25519 key pair.
 */
export function genX25519KeyPair(): Promise<[string, string]> {
  return SLKCrypto.genX25519KeyPair();
}

/**
 * Generate the public key for a given X25519 secret key.
 */
export function genX25519PubKeyFromSecret(
  secretKeyHex: string
): Promise<string> {
  invariant(secretKeyHex.length === 2 * SLKCrypto.crypto_scalarmult_BYTES);
  return SLKCrypto.genX25519PubKeyFromSecret(secretKeyHex);
}

/**
 * Generate an X25519 secret.
 */
export function genX25519SharedSecret(
  ourSecretKeyHex: string,
  theirPublicKeyHex: string
): Promise<string> {
  invariant(ourSecretKeyHex.length === 2 * SLKCrypto.crypto_scalarmult_BYTES);
  invariant(theirPublicKeyHex.length === 2 * SLKCrypto.crypto_scalarmult_BYTES);
  return SLKCrypto.genX25519SharedSecret(ourSecretKeyHex, theirPublicKeyHex);
}

export const X25519_KEY_BYTES = SLKCrypto.crypto_scalarmult_BYTES;
