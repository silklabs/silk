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
 *   k / seed (libsodium) / secret (elliptic)
 *     32 random bytes, in essence the "private key"
 *
 *   a / private scalar
 *     first 32 bytes of sha512(k) with some low and high bits cleared
 *
 *   A / public key
 *     A = a * B (where * denotes known-base-point scalar multiplication
 *     and B is a curve parameter), 32 bytes long
 *
 *   secret key (libsodium) / key pair (elliptic)
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

import { randomBytes, pbkdf2 } from 'mz/crypto';
import { api as sodium } from 'sodium';

/**
 * Requests a number of random bytes.
 */
export function genRandomBytes(numberOfBytes: number): Promise<Buffer> {
  return randomBytes(numberOfBytes);
}

/**
 * Derive a 256 bit key from a password using PBKDF2 and HMAC-SHA256.
 */
export function genPBKDF2KeyDerivation(
  input: string,
  salt: string,
  rounds: number
): Promise<string> {
  return pbkdf2(input, salt, rounds, 32, 'sha256')
    .then((key) => key.toString('hex'));
}


/**
 * Generate a new Ed25519 key pair.
 */
export function genEd25519KeyPair(): Promise<[string, string]> {
  const {publicKey, secretKey} = sodium.crypto_sign_ed25519_keypair();
  // Only return the seed part of the secret key.
  const seed = secretKey.slice(0, sodium.crypto_sign_ed25519_SEEDBYTES);
  return Promise.resolve([seed.toString('hex'), publicKey.toString('hex')]);
}

/**
 * Generate the public key for a given Ed25519 secret key.
 */
export function genEd25519PubKeyFromSecret(seedHex: string): Promise<string> {
  const seed = new Buffer(seedHex, 'hex');
  const {publicKey} = sodium.crypto_sign_ed25519_seed_keypair(seed);
  return Promise.resolve(publicKey.toString('hex'));
}

/**
 * Generate Ed25519 signature
 */
export function genEd25519Sign(
  messageHex: string,
  seedHex: string
): Promise<string> {
  const message = new Buffer(messageHex, 'hex');
  const seed = new Buffer(seedHex, 'hex');
  const {secretKey} = sodium.crypto_sign_ed25519_seed_keypair(seed);
  const signature = sodium.crypto_sign_ed25519_detached(message, secretKey);
  return Promise.resolve(signature.toString('hex'));
}

/**
 * Verify Ed25519 signature
 */
export function genEd25519Verify(
  messageHex: string,
  signatureHex: string,
  publicKeyHex: string
): Promise<boolean> {
  const message = new Buffer(messageHex, 'hex');
  const signature = new Buffer(signatureHex, 'hex');
  const publicKey = new Buffer(publicKeyHex, 'hex');
  const verified = sodium.crypto_sign_ed25519_verify_detached(
    signature,
    message,
    publicKey
  );
  return Promise.resolve(verified);
}

export const ED25519_KEY_BYTES = sodium.crypto_sign_ed25519_PUBLICKEYBYTES;
export const ED25519_SIG_BYTES = sodium.crypto_sign_ed25519_BYTES;


/**
 * Generate a new X25519 key pair.
 */
export function genX25519KeyPair(): Promise<[string, string]> {
  return randomBytes(sodium.crypto_scalarmult_BYTES).then((secretKey) => {
    const publicKey = sodium.crypto_scalarmult_base(secretKey);
    return [secretKey.toString('hex'), publicKey.toString('hex')];
  });
}

/**
 * Generate the public key for a given X25519 secret key.
 */
export function genX25519PubKeyFromSecret(
  secretKeyHex: string
): Promise<string> {
  const secretKey = new Buffer(secretKeyHex, 'hex');
  const publicKey = sodium.crypto_scalarmult_base(secretKey);
  return Promise.resolve(publicKey.toString('hex'));
}

/**
 * Generate an X25519 secret.
 */
export function genX25519SharedSecret(
  ourSecretKeyHex: string,
  theirPublicKeyHex: string
): Promise<string> {
  const ourSecretKey = new Buffer(ourSecretKeyHex, 'hex');
  const theirPublicKey = new Buffer(theirPublicKeyHex, 'hex');
  const sharedSecret = sodium.crypto_scalarmult(ourSecretKey, theirPublicKey);
  return Promise.resolve(sharedSecret.toString('hex'));
}

export const X25519_KEY_BYTES = sodium.crypto_scalarmult_BYTES;
