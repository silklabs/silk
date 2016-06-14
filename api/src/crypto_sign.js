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
const encodingLength = ed25519.encodingLength;

/**
 * Generate and return a keypair as tuple (secret key, public key),
 * encoded as hex strings.
 */
function genKeyPair(
  options: {entropy?: Buffer;}
): Promise<[string, string]> {
  const secret = options.entropy || crypto.randomBytes(encodingLength);
  invariant(Buffer.isBuffer(secret));
  invariant(secret.length === encodingLength);
  const secretKeyHex = secret.toString('hex');
  return genPublicKeyFromSecret(secretKeyHex)
    .then((publicKeyHex) => [secretKeyHex, publicKeyHex]);
}

/**
 * Compute the public key given a secret key, both encoded as hex strings.
 */
function genPublicKeyFromSecret(
  secretKeyHex: string
): Promise<string> {
  invariant(secretKeyHex.length === 2 * encodingLength);
  const keyPair = ed25519.keyFromSecret(secretKeyHex);
  return Promise.resolve(keyPair.getPublic('hex'));
}

function genSign(
  messageHex: string,
  secretKeyHex: string
): Promise<string> {
  invariant(secretKeyHex.length === 2 * encodingLength);
  const key = ed25519.keyFromSecret(secretKeyHex);
  const signature = key.sign(messageHex);
  return Promise.resolve(signature.toHex().toLowerCase());
}

function genVerify(
  messageHex: string,
  signatureHex: string,
  publicKeyHex: string
): Promise<boolean> {
  invariant(publicKeyHex.length === 2 * encodingLength);
  invariant(signatureHex.length === 4 * encodingLength);
  // `elliptic` is usually fine eating Buffers where it expects arrays,
  // but here are two cases where we really need to pass arrays.
  const key = ed25519.keyFromPublic(publicKeyHex);
  return key.verify(messageHex, signatureHex);
}

const API = {
  encodingLength,
  genKeyPair,
  genPublicKeyFromSecret,
  genSign,
  genVerify,
};
export default API;

export function overrideImplementation(overrides: typeof API) {
  Object.assign(API, overrides);
}
