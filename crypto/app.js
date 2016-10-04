/**
 * @flow
 */

import invariant from 'assert';
import {NativeModules} from 'react-native';

import {toBuffer, toHexString} from './util';

const {SLKCrypto} = NativeModules;

/**
 * Requests a number of random bytes.
 */
export function genRandomBytes(numberOfBytes: number): Promise<Buffer> {
  return SLKCrypto.genRandomBytesHex(numberOfBytes).then(toBuffer);
}

/**
 * Derive a 256 bit key from a password using PBKDF2 and HMAC-SHA256.
 */
export const pbkdf2 = Object.freeze({

  genKeyDerivationHex(
    input: string,
    salt: string,
    rounds: number
  ): Promise<string> {
    return SLKCrypto.genPBKDF2KeyDerivationHex(input, salt, rounds);
  },

  genKeyDerivation(
    input: string,
    salt: string,
    rounds: number
  ): Promise<Buffer> {
    return pbkdf2.genKeyDerivationHex(input, salt, rounds).then(toBuffer);
  },

});

export const ed25519 = Object.freeze({

  KEY_BYTES: SLKCrypto.crypto_sign_ed25519_PUBLICKEYBYTES,
  SIG_BYTES: SLKCrypto.crypto_sign_ed25519_BYTES,

  /**
   * Generate a new Ed25519 key pair.
   */
  genKeyPairHex(): Promise<[string, string]> {
    return SLKCrypto.genEd25519KeyPairHex();
  },

  genKeyPair(): Promise<[Buffer, Buffer]> {
    return ed25519.genKeyPairHex().then(([signingHex, verifyingHex]) => {
      return [toBuffer(signingHex), toBuffer(verifyingHex)];
    });
  },

  /**
   * Generate the public key for a given Ed25519 secret key.
   */
  genVerifyingKeyFromSigningKeyHex(
    signingKey: string | Buffer,
  ): Promise<string> {
    const signingKeyHex = toHexString(signingKey);
    invariant(
      signingKeyHex.length === 2 * SLKCrypto.crypto_sign_ed25519_SEEDBYTES
    );
    return SLKCrypto.genEd25519VerifyingKeyFromSigningKeyHex(signingKeyHex);
  },

  genVerifyingKeyFromSigningKey(
    signingKey: string | Buffer,
  ): Promise<Buffer> {
    return ed25519.genVerifyingKeyFromSigningKeyHex(signingKey).then(toBuffer);
  },

  /**
   * Generate Ed25519 signature
   */
  genSignHex(
    message: string | Buffer,
    signingKey: string | Buffer,
  ): Promise<string> {
    const messageHex = toHexString(message);
    const signingKeyHex = toHexString(signingKey);
    invariant(
      signingKeyHex.length === 2 * SLKCrypto.crypto_sign_ed25519_SEEDBYTES
    );
    return SLKCrypto.genEd25519SignHex(messageHex, signingKeyHex);
  },

  genSign(
    message: string | Buffer,
    signingKey: string | Buffer,
  ): Promise<Buffer> {
    return ed25519.genSign(message, signingKey).then(toBuffer);
  },

  /**
   * Verify Ed25519 signature
   */
  genVerify(
    message: string | Buffer,
    signature: string | Buffer,
    verifyingKey: string | Buffer,
  ): Promise<boolean> {
    const messageHex = toHexString(message);
    const signatureHex = toHexString(signature);
    const verifyingKeyHex = toHexString(verifyingKey);
    invariant(signatureHex.length === 2 * SLKCrypto.crypto_sign_ed25519_BYTES);
    invariant(verifyingKeyHex.length ===
              2 * SLKCrypto.crypto_sign_ed25519_PUBLICKEYBYTES);
    return SLKCrypto.genEd25519Verify(
      messageHex,
      signatureHex,
      verifyingKeyHex,
    ).then((result) => !!result);
  },

});


export const x25519 = Object.freeze({

  KEY_BYTES: SLKCrypto.crypto_scalarmult_BYTES,

  /**
   * Generate a new X25519 key pair.
   */
  genKeyPairHex(): Promise<[string, string]> {
    return SLKCrypto.genX25519KeyPairHex();
  },

  genKeyPair(): Promise<[Buffer, Buffer]> {
    return x25519.genKeyPairHex().then(([privateKeyHex, publicKeyHex]) => {
      return [toBuffer(privateKeyHex), toBuffer(publicKeyHex)];
    });
  },

  /**
   * Generate the public key for a given X25519 secret key.
   */
  genPublicKeyFromPrivateKeyHex(
    privateKey: string | Buffer,
  ): Promise<string> {
    const privateKeyHex = toHexString(privateKey);
    invariant(privateKeyHex.length === 2 * SLKCrypto.crypto_scalarmult_BYTES);
    return SLKCrypto.genX25519PublicKeyFromPrivateKeyHex(privateKeyHex);
  },

  genPublicKeyFromPrivateKey(
    privateKey: string | Buffer,
  ): Promise<Buffer> {
    return x25519.genPublicKeyFromPrivateKeyHex(privateKey).then(toBuffer);
  },

  /**
   * Generate an X25519 secret.
   */
  genSharedSecretHex(
    ourPrivateKey: string | Buffer,
    theirPublicKey: string | Buffer,
  ): Promise<string> {
    const ourPrivateKeyHex = toHexString(ourPrivateKey);
    const theirPublicKeyHex = toHexString(theirPublicKey);
    invariant(
      ourPrivateKeyHex.length === 2 * SLKCrypto.crypto_scalarmult_BYTES
    );
    invariant(
      theirPublicKeyHex.length === 2 * SLKCrypto.crypto_scalarmult_BYTES
    );
    return SLKCrypto.genX25519SharedSecretHex(
      ourPrivateKeyHex,
      theirPublicKeyHex,
    );
  },

  genSharedSecret(
    ourPrivateKey: string | Buffer,
    theirPublicKey: string | Buffer,
  ): Promise<Buffer> {
    return x25519.genSharedSecretHex(ourPrivateKey, theirPublicKey)
      .then(toBuffer);
  },

});
