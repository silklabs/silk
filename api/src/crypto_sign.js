/**
 * Edwards-curve Digital Signature Algorithm (EdDSA) implementation
 *
 * We use EdDSA for jsonwebtoken signatures to sign all API requests.
 * We also use it to generate and verify device registration tokens.
 *
 * EdDSA, in particular the Ed25519 implementation that uses
 * curve25519, is defined in
 * https://tools.ietf.org/html/draft-josefsson-eddsa-ed25519-02.
 *
 * EdDSA terminology:
 *
 *   k / secret (elliptic) / seed (libsodium)
 *     32 random bytes, in essence the "private key"
 *
 *   a / private scalar
 *     first 32 bytes of sha512(k) with some low and high bits cleared
 *
 *   A / public key
 *     A = a * B (where * denotes known-base-point scalar multiplication
 *     and B is a curve parameter), 32 bytes long
 *
 *   key pair (elliptic) / secret key (libsodium)
 *     concatenation of [k, A], 64 bytes long
 *
 *   signature
 *     concatenation of [encode(R), encode(S)], 64 bytes long
 *
 * https://blog.mozilla.org/warner/2011/11/29/ed25519-keys/ provides a
 * good overview of the concepts.
 *
 * @flow
 */

import invariant from 'assert';
import crypto from 'crypto';
import { eddsa as EdDSA } from 'elliptic';

const ed25519 = new EdDSA('ed25519');
export const encodingLength = ed25519.encodingLength;

/**
 * Generate and return a keypair as tuple (secret key, public key).
 */
export function generateKeyPair(
  options: {entropy?: Buffer;}
): [Buffer, Buffer] {
  const secret = options.entropy || crypto.randomBytes(encodingLength);
  invariant(Buffer.isBuffer(secret));
  invariant(secret.length === encodingLength);
  return [secret, publicKeyFromSecret(secret)];
}

/**
 * Compute the public key given a secret key
 */
export function publicKeyFromSecret(
  secretKey: Buffer
): Buffer {
  invariant(secretKey.length === ed25519.encodingLength);
  const keyPair = ed25519.keyFromSecret(secretKey);
  return new Buffer(keyPair.getPublic());
}

export function sign(
  message: Buffer,
  secretKey: Buffer
): Buffer {
  invariant(secretKey.length === ed25519.encodingLength);
  const key = ed25519.keyFromSecret(secretKey);
  const signature = key.sign(message);
  return new Buffer(signature.toBytes());
}

export function verify(
  message: Buffer,
  signature: Buffer,
  publicKey: Buffer
): boolean {
  invariant(publicKey.length === ed25519.encodingLength);
  invariant(signature.length === 2 * ed25519.encodingLength);
  // `elliptic` is usually fine eating Buffers where it expects arrays,
  // but here are two cases where we really need to pass arrays.
  const key = ed25519.keyFromPublic(Array.from(publicKey));
  return key.verify(message, Array.from(signature));
}

export function sha256(data: ?string): Buffer {
  const hasher = crypto.createHash('sha256');
  hasher.update(data || '');
  return hasher.digest();
}

export function sha256hex(data: ?string): string {
  return sha256(data).toString('hex');
}
