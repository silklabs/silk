/**
 * Replacement EdDSA / Ed25519 implementation that uses native libsodium.
 * About 5x faster than the `elliptic` JS library when run on JavaScriptCore.
 *
 * @flow
 */

import invariant from 'assert';
import { NativeModules } from 'react-native';
import { overrideCryptoSignImplementation } from 'silk-api';

const { AppCryptoSync } = NativeModules;

const encodingLength = AppCryptoSync.EncodingLength;

function genKeyPair(
  options: {entropy?: Buffer;}
): Promise<[Buffer, Buffer]> {
  // libsodium can generate its own random seed, so we don't need any
  // entropy passed in.
  const [errorMsg, secretHex, publicKeyHex] = global._crypto_ed25519_generate_keypair();
  if (errorMsg) {
    throw new Error(errorMsg);
  }
  return Promise.resolve(
    [new Buffer(secretHex, 'hex'), new Buffer(publicKeyHex, 'hex')]
  );
}

function genPublicKeyFromSecret(
  secretKey: Buffer
): Promise<Buffer> {
  invariant(secretKey.length === encodingLength);
  const [errorMsg, pubKeyHex] = global._crypto_ed25519_pubkey_from_secret(
    secretKey.toString('hex')
  );
  if (errorMsg) {
    throw new Error(errorMsg);
  }
  return Promise.resolve(new Buffer(pubKeyHex, 'hex'));
}

function sign(
  message: Buffer,
  secretKey: Buffer
): Buffer {
  invariant(secretKey.length === encodingLength);
  const [errorMsg, signatureHex] = global._crypto_ed25519_sign_hex(
    message.toString('hex'),
    secretKey.toString('hex')
  );
  if (errorMsg) {
    throw new Error(errorMsg);
  }
  return new Buffer(signatureHex, 'hex');
}

function verify(
  message: Buffer,
  signature: Buffer,
  publicKey: Buffer
): boolean {
  invariant(publicKey.length === encodingLength);
  invariant(signature.length === 2 * encodingLength);
  const [errorMsg, verify] = global._crypto_ed25519_verify_hex(
    message.toString('hex'),
    signature.toString('hex'),
    publicKey.toString('hex')
  );
  if (errorMsg) {
    throw new Error(errorMsg);
  }
  return verify === 'true';
}

overrideCryptoSignImplementation({
  encodingLength,
  genKeyPair,
  genPublicKeyFromSecret,
  sign,
  verify,
});
