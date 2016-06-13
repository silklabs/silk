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

function genKeyPair(): Promise<[string, string]> {
  return AppCryptoSync.genEd25519KeyPair();
}

function genPublicKeyFromSecret(
  secretKeyHex: string
): Promise<string> {
  invariant(secretKeyHex.length === 2 * encodingLength);
  return AppCryptoSync.genEd25519PubKeyFromSecret(secretKeyHex);
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
