/**
 * This module implements the core of https://tools.ietf.org/html/rfc7518 with
 * specific support for ed25519 as a sign/verify algorithm support for other
 * algorithms is omitted (we don't need them)
 */

import { sha256 } from 'hash.js';
import { ec as EC } from 'elliptic';
import base64url from 'base64url';

const ALGO = 'ed25519';
const ec = new EC('ed25519');

/**
 * Sign the input with the given private key.
 *
 * @param {String} input string to sign (should be ascii).
 * @param {String} privateKey hex private key.
 * @return {String} base64url encoded signature.
 */
function sign(input, privateKey) {
  let key = ec.keyFromPrivate(privateKey, 'hex');

  // Signing is defined by https://tools.ietf.org/html/rfc7518#section-3.4
  let hash = sha256().update(input).digest('hex');
  let signed = key.sign(hash, 'hex');

  // Per rfc7518 we create a single array R then S in BE order.
  let r = signed.r.toArray('be', 32);
  let s = signed.s.toArray('be', 32);
  return base64url(new Buffer(r.concat(s)));
}

/**
 * Verify the input against signature using the given public key.
 *
 * @param {String} input to verify.
 * @param {String} signature JWS Signature string (returned from sign)
 * @param {String} publicKey public key to use in validation.
 * @return {Boolean} true when input is verified by signature.
 */
function verify(input, signature, publicKey) {
  let key = ec.keyFromPublic(publicKey, 'hex');

  if (!signature || typeof signature !== 'string') {
    // TODO: Logging.
    return false;
  }

  let hash = sha256().update(input).digest('hex');
  let bufferSig = base64url.toBuffer(signature);
  let signatureDecoded = [];

  // Convert the buffer into an array of octets represented by js Number.
  // This can be passed to elliptic.
  for (let i = 0; i < bufferSig.length; i++) {
    signatureDecoded.push(bufferSig[i]);
  }

  if (signatureDecoded.length !== 64) {
    throw new Error('invalid signature length');
  }

  let options = {
    r: signatureDecoded.slice(0, 32),
    s: signatureDecoded.slice(32)
  };

  return key.verify(
    hash,
    options,
    key,
    'hex'
  );
}

/**
 * @param {String} algorithm (must be ed25519)
 */
export default function factory(algorithm) {
  if (algorithm !== ALGO) {
    throw new Error(`JWA only supports: ${ALGO}`);
  }

  return {
    sign,
    verify
  };
}

factory.ALGORITHMS = ['ed25519'];
