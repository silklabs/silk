/**
 * JS-only re-implementation of silk-crypto.
 *
 * @flow
 */

/* eslint-env browser */

import invariant from 'assert';
import {eddsa as EdDSA} from 'elliptic';
import sjcl from 'sjcl';

import {toBuffer, toHexString} from './util';

sjcl.random.startCollectors();

const eddsa = new EdDSA('ed25519');

/**
 * Elliptic eats either hex strings or arrays, not Buffers.
 */
function toElliptic(
  bufferOrHexString: string | Buffer,
): string | Array<void> {
  if (typeof bufferOrHexString === 'string') {
    return bufferOrHexString;
  }
  invariant(bufferOrHexString instanceof Buffer);
  return Array.from(bufferOrHexString);
}

function assertByteLength(bufferOrHexString, length) {
  if (typeof bufferOrHexString === 'string') {
    invariant(bufferOrHexString.length === 2 * length);
    return;
  }
  invariant(bufferOrHexString.length === length);
}

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

export const pbkdf2 = Object.freeze({

  genKeyDerivationHex(
    input: string,
    salt: string,
    rounds: number
  ): Promise<string> {
    const output = sjcl.misc.pbkdf2(input, salt, rounds);
    return Promise.resolve(sjcl.codec.hex.fromBits(output));
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

  KEY_BYTES: eddsa.encodingLength,
  SIG_BYTES: 2 * eddsa.encodingLength,

  /**
   * Generate and return a keypair as tuple (secret key, public key),
   * encoded as hex strings.
   */
  async genKeyPair(): Promise<[Buffer, Buffer]> {
    const signingKey = await genRandomBytes(eddsa.encodingLength);
    const verifyingKey = await ed25519.genVerifyingKeyFromSigningKey(signingKey);
    return [signingKey, verifyingKey];
  },

  genKeyPairHex(): Promise<[string, string]> {
    return ed25519.genKeyPair().then(([signing, verifying]) => {
      return [toHexString(signing), toHexString(verifying)];
    });
  },

  /**
   * Compute the public key given a secret key, both encoded as hex strings.
   */
  genVerifyingKeyFromSigningKey(
    signingKey: string | Buffer,
  ): Promise<Buffer> {
    assertByteLength(signingKey, eddsa.encodingLength);
    const keyPair = eddsa.keyFromSecret(toElliptic(signingKey));
    return Promise.resolve(new Buffer(keyPair.getPublic()));
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
    assertByteLength(signingKey, eddsa.encodingLength);
    const key = eddsa.keyFromSecret(toElliptic(signingKey));
    const signature = key.sign(toElliptic(message));
    return Promise.resolve(new Buffer(signature.toBytes()));
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
    assertByteLength(verifyingKey, eddsa.encodingLength);
    assertByteLength(signature, 2 * eddsa.encodingLength);
    const key = eddsa.keyFromPublic(toElliptic(verifyingKey));
    return key.verify(toElliptic(message), toElliptic(signature));
  },

});


export const x25519 = Object.freeze({

  KEY_BYTES: 32,

  /**
   * Generate a new X25519 key pair.
   */
  genKeyPair(): Promise<[Buffer, Buffer]> {
    throw new Error('Not supported');
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
    throw new Error('Not supported');
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
    throw new Error('Not supported');
  },

  genSharedSecretHex(
    ourPrivateKey: string | Buffer,
    theirPublicKey: string | Buffer,
  ): Promise<string> {
    return x25519.genSharedSecret(ourPrivateKey, theirPublicKey)
      .then(toHexString);
  },

});
