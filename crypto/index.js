/***
 * Silk Crypto Library
 *
 * @flow
 */

import {randomBytes, pbkdf2 as cryptoPBKDF2} from 'mz/crypto';
import {api as sodium} from 'sodium';

import {toBuffer, toHexString} from './util';

/**
 * Requests a number of random bytes.
 */
export function genRandomBytes(numberOfBytes: number): Promise<Buffer> {
  return randomBytes(numberOfBytes);
}

/**
 * Derive a 256 bit key from a password using PBKDF2 and HMAC-SHA256.
 */
export const pbkdf2 = Object.freeze({

  genKeyDerivation(
    input: string,
    salt: string,
    rounds: number
  ): Promise<Buffer> {
    return cryptoPBKDF2(input, salt, rounds, 32, 'sha256');
  },

  genKeyDerivationHex(
    input: string,
    salt: string,
    rounds: number
  ): Promise<string> {
    return pbkdf2.genKeyDerivation(input, salt, rounds).then(toHexString);
  },

});


/**
 * Edwards-curve Digital Signature Algorithm (EdDSA) implementation
 *
 * We use EdDSA for jsonwebtoken signatures to sign all API requests.
 * We also use it to generate and verify device registration tokens.
 *
 * EdDSA, in particular the Ed25519 implementation that uses curve25519,
 * is defined in https://tools.ietf.org/html/draft-irtf-cfrg-eddsa-08.
 *
 * EdDSA terminology:
 *
 *   k / seed (libsodium) / secret (elliptic) / signing key (Silk)
 *     32 random bytes, in essence the "private key"
 *
 *   a / private scalar
 *     first 32 bytes of sha512(k) with some low and high bits cleared
 *
 *   A / public key (libsodium, elliptic) / verifying key (Silk)
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
 */
export const ed25519 = Object.freeze({

  KEY_BYTES: sodium.crypto_sign_ed25519_PUBLICKEYBYTES,
  SIG_BYTES: sodium.crypto_sign_ed25519_BYTES,

  /**
   * Generate a new Ed25519 key pair.
   */
  genKeyPair(): Promise<[Buffer, Buffer]> {
    const {publicKey, secretKey} = sodium.crypto_sign_ed25519_keypair();
    // Only return the seed part of the secret key.
    const signingKey = secretKey.slice(0, sodium.crypto_sign_ed25519_SEEDBYTES);
    return Promise.resolve([signingKey, publicKey]);
  },

  genKeyPairHex(): Promise<[string, string]> {
    return ed25519.genKeyPair().then(([signing, verifying]) => {
      return [toHexString(signing), toHexString(verifying)];
    });
  },

  /**
   * Generate the public key for a given Ed25519 secret key.
   */
  genVerifyingKeyFromSigningKey(
    signingKey: string | Buffer,
  ): Promise<Buffer> {
    signingKey = toBuffer(signingKey);
    const {publicKey} = sodium.crypto_sign_ed25519_seed_keypair(signingKey);
    return Promise.resolve(publicKey);
  },

  genVerifyingKeyFromSigningKeyHex(
    signingKey: string | Buffer,
  ): Promise<string> {
    return ed25519.genVerifyingKeyFromSigningKey(signingKey).then(toHexString);
  },

  /**
   * Generate Ed25519 signature
   */
  genSign(
    message: string | Buffer,
    signingKey: string | Buffer,
  ): Promise<Buffer> {
    signingKey = toBuffer(signingKey);
    const {secretKey} = sodium.crypto_sign_ed25519_seed_keypair(signingKey);
    const signature = sodium.crypto_sign_ed25519_detached(
      toBuffer(message),
      secretKey,
    );
    return Promise.resolve(signature);
  },

  genSignHex(
    message: string | Buffer,
    signingKey: string | Buffer,
  ): Promise<string> {
    return ed25519.genSign(message, signingKey).then(toHexString);
  },

  /**
   * Verify Ed25519 signature
   */
  genVerify(
    message: string | Buffer,
    signature: string | Buffer,
    verifyingKey: string | Buffer,
  ): Promise<boolean> {
    const verified = sodium.crypto_sign_ed25519_verify_detached(
      toBuffer(signature),
      toBuffer(message),
      toBuffer(verifyingKey),
    );
    return Promise.resolve(verified);
  },

});

/**
 * Diffie-Hellman exchange based on curve25519
 *
 * See https://tools.ietf.org/html/rfc7748
 */
export const x25519 = Object.freeze({

  KEY_BYTES: sodium.crypto_scalarmult_BYTES,

  /**
   * Generate a new X25519 key pair.
   */
  genKeyPair(): Promise<[Buffer, Buffer]> {
    return randomBytes(sodium.crypto_scalarmult_BYTES).then((privateKey) => {
      const publicKey = sodium.crypto_scalarmult_base(privateKey);
      return [privateKey, publicKey];
    });
  },

  genKeyPairHex(): Promise<[string, string]> {
    return x25519.genKeyPair().then(([privateKey, publicKey]) => {
      return [toHexString(privateKey), toHexString(publicKey)];
    });
  },

  /**
   * Generate the public key for a given X25519 secret key.
   */
  genPublicKeyFromPrivateKey(
    privateKey: string | Buffer,
  ): Promise<Buffer> {
    const publicKey = sodium.crypto_scalarmult_base(toBuffer(privateKey));
    return Promise.resolve(publicKey);
  },

  genPublicKeyFromPrivateKeyHex(
    privateKey: string | Buffer,
  ): Promise<string> {
    return x25519.genPublicKeyFromPrivateKey(privateKey).then(toHexString);
  },

  /**
   * Generate an X25519 secret.
   */
  genSharedSecret(
    ourPrivateKey: string | Buffer,
    theirPublicKey: string | Buffer,
  ): Promise<Buffer> {
    const sharedSecret = sodium.crypto_scalarmult(
      toBuffer(ourPrivateKey),
      toBuffer(theirPublicKey),
    );
    return Promise.resolve(sharedSecret);
  },

  genSharedSecretHex(
    ourPrivateKey: string | Buffer,
    theirPublicKey: string | Buffer,
  ): Promise<string> {
    return x25519.genSharedSecret(ourPrivateKey, theirPublicKey)
      .then(toHexString);
  },

});
