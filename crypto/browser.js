/**
 * JS-only re-implementation of silk-crypto.
 *
 * @flow
 */

/* eslint-env browser */

import invariant from 'assert';
import { eddsa as EdDSA } from 'elliptic';
import sjcl from 'sjcl';
sjcl.random.startCollectors();

const ed25519 = new EdDSA('ed25519');

/**
 * Requests a number of random bytes.
 */
export function genRandomBytes(numberOfBytes: number): Promise<Buffer> {
  const bytes = new Uint8Array(numberOfBytes);
  window.crypto.getRandomValues(bytes);
  // $FlowFixMe https://github.com/facebook/flow/pull/1983
  return Promise.resolve(new Buffer(bytes));
}

/**
 * Derive a 256 bit key from a password using PBKDF2 and HMAC-SHA256.
 */
export function genPBKDF2KeyDerivation(
  input: string,
  salt: string,
  rounds: number
): Promise<string> {
  const output = sjcl.misc.pbkdf2(input, salt, rounds);
  return Promise.resolve(sjcl.codec.hex.fromBits(output));
}

/**
 * Generate and return a keypair as tuple (secret key, public key),
 * encoded as hex strings.
 */
export async function genEd25519KeyPair(): Promise<[string, string]> {
  const secret = await genRandomBytes(ed25519.encodingLength);
  const secretKeyHex = secret.toString('hex');
  const publicKeyHex = await genEd25519PubKeyFromSecret(secretKeyHex);
  return [secretKeyHex, publicKeyHex];
}

/**
 * Compute the public key given a secret key, both encoded as hex strings.
 */
export function genEd25519PubKeyFromSecret(
  secretKeyHex: string
): Promise<string> {
  invariant(secretKeyHex.length === 2 * ed25519.encodingLength);
  const keyPair = ed25519.keyFromSecret(secretKeyHex);
  return Promise.resolve(keyPair.getPublic('hex'));
}

/**
 * Generate Ed25519 signature
 */
export function genEd25519Sign(
  messageHex: string,
  secretKeyHex: string
): Promise<string> {
  invariant(secretKeyHex.length === 2 * ed25519.encodingLength);
  const key = ed25519.keyFromSecret(secretKeyHex);
  const signature = key.sign(messageHex);
  return Promise.resolve(signature.toHex().toLowerCase());
}

/**
 * Verify Ed25519 signature
 */
export function genEd25519Verify(
  messageHex: string,
  signatureHex: string,
  publicKeyHex: string
): Promise<boolean> {
  invariant(publicKeyHex.length === 2 * ed25519.encodingLength);
  invariant(signatureHex.length === 4 * ed25519.encodingLength);
  // `elliptic` is usually fine eating Buffers where it expects arrays,
  // but here are two cases where we really need to pass arrays.
  const key = ed25519.keyFromPublic(publicKeyHex);
  return key.verify(messageHex, signatureHex);
}

export const ED25519_KEY_BYTES = ed25519.encodingLength;
export const ED25519_SIG_BYTES = 2 * ed25519.encodingLength;


/**
 * Generate a new X25519 key pair.
 */
export function genX25519KeyPair(): Promise<[string, string]> {
  throw new Error('Not supported');
}

/**
 * Generate the public key for a given X25519 secret key.
 */
export function genX25519PubKeyFromSecret(
  secretKeyHex: string
): Promise<string> {
  throw new Error('Not supported');
}

/**
 * Generate an X25519 secret.
 */
export function genX25519SharedSecret(
  ourSecretKeyHex: string,
  theirPublicKeyHex: string
): Promise<string> {
  throw new Error('Not supported');
}

export const X25519_KEY_BYTES = 32;
