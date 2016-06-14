/**
 * This module implements the core of https://tools.ietf.org/html/rfc7518 with
 * specific support for ed25519 as a sign/verify algorithm support for other
 * algorithms is omitted (we don't need them)
 *
 * @flow
 */

import base64url from 'base64url';
import crypto from 'crypto';
import { eddsa as EdDSA } from 'elliptic';

const ALGO = 'ed25519';
const ed25519 = new EdDSA('ed25519');

/**
 * Sign the input with the given private key.
 *
 * @param {String} input string to sign (should be ascii).
 * @param {String} privateKeyHex hex private key.
 * @return {String} base64url encoded signature.
 */
function sign(
  input: string,
  privateKey: Buffer
): string {
  const message = crypto.createHash('sha256').update(input).digest();
  const key = ed25519.keyFromSecret(privateKey);
  const signature = key.sign(message);
  return base64url(new Buffer(signature.toBytes()));
}

/**
 * Verify the input against signature using the given public key.
 *
 * @param {String} input to verify.
 * @param {String} signature JWS Signature string (returned from sign)
 * @param {String} publicKey public key to use in validation.
 * @return {Boolean} true when input is verified by signature.
 */
function verify(
  input: string,
  signatureBase64url: string,
  publicKey: Buffer
): boolean {
  if (!signatureBase64url || typeof signatureBase64url !== 'string') {
    // TODO: Logging.
    return false;
  }
  const message = crypto.createHash('sha256').update(input).digest();
  // `elliptic` is usually fine eating Buffers where it expects arrays,
  // but here are two cases where we really need to pass arrays.
  const signature = Array.from(base64url.toBuffer(signatureBase64url));
  const key = ed25519.keyFromPublic(Array.from(publicKey));
  return key.verify(message, signature);
}

/**
 * @param {String} algorithm (must be ed25519)
 */
export default function factory(algorithm: string): any {
  if (algorithm !== ALGO) {
    throw new Error(`JWA only supports: ${ALGO}`);
  }
  return {sign, verify};
}

factory.ALGORITHMS = ['ed25519'];
