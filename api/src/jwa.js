/**
 * This module implements the core of https://tools.ietf.org/html/rfc7518 with
 * specific support for ed25519 as a sign/verify algorithm support for other
 * algorithms is omitted (we don't need them)
 *
 * @flow
 */

import base64url from 'base64url';
import crypto from 'crypto';

import cryptoSign from './crypto_sign';

const ALGO = 'ed25519';

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
  return base64url(cryptoSign.sign(
    crypto.createHash('sha256').update(input).digest(),
    privateKey
  ));
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

  return cryptoSign.verify(
    crypto.createHash('sha256').update(input).digest(),
    base64url.toBuffer(signatureBase64url),
    publicKey
  );
}

/**
 * @param {String} algorithm (must be ed25519)
 */
export default function factory(algorithm: string): any {
  if (algorithm !== ALGO) {
    throw new Error(`JWA only supports: ${ALGO}`);
  }

  return {
    sign,
    verify
  };
}

factory.ALGORITHMS = ['ed25519'];
