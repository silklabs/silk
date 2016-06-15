/**
 * Replacement EdDSA / Ed25519 implementation that uses native libsodium.
 * About 5x faster than the `elliptic` JS library when run on JavaScriptCore.
 *
 * @flow
 */

import invariant from 'assert';
import { NativeModules } from 'react-native';
import { overrideCryptoSignImplementation } from 'silk-api';

const { SLKCrypto } = NativeModules;

const encodingLength = SLKCrypto.EncodingLength;

function genKeyPair(): Promise<[string, string]> {
  return SLKCrypto.genEd25519KeyPair();
}

function genPublicKeyFromSecret(
  secretKeyHex: string
): Promise<string> {
  invariant(secretKeyHex.length === 2 * encodingLength);
  return SLKCrypto.genEd25519PubKeyFromSecret(secretKeyHex);
}

function genSign(
  messageHex: string,
  secretKeyHex: string
): Promise<string> {
  invariant(secretKeyHex.length === 2 * encodingLength);
  return SLKCrypto.genEd25519Sign(messageHex, secretKeyHex);
}

function genVerify(
  messageHex: string,
  signatureHex: string,
  publicKeyHex: string
): Promise<boolean> {
  invariant(publicKeyHex.length === 2 * encodingLength);
  invariant(signatureHex.length === 4 * encodingLength);
  return SLKCrypto.genEd25519Verify(messageHex, signatureHex, publicKeyHex)
    .then((result) => !!result);
}

overrideCryptoSignImplementation({
  encodingLength,
  genKeyPair,
  genPublicKeyFromSecret,
  genSign,
  genVerify,
});
