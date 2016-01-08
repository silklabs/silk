/**
 * This module implements the core of https://tools.ietf.org/html/rfc7518 with
 * specific support for ed25519 as a sign/verify algorithm support for other
 * algorithms is omitted (we don't need them)
 *
 * @flow
 */

import base64url from 'base64url';
import * as cryptoSign from './crypto_sign';

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
  privateKeyHex: string
): string {
  return base64url(cryptoSign.sign(
    cryptoSign.sha256(input),
    new Buffer(privateKeyHex, 'hex')
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
  publicKeyHex: string
): boolean {
  if (!signatureBase64url || typeof signatureBase64url !== 'string') {
    // TODO: Logging.
    return false;
  }

  return cryptoSign.verify(
    cryptoSign.sha256(input),
    base64url.toBuffer(signatureBase64url),
    new Buffer(publicKeyHex, 'hex')
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
