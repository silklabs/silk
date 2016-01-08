/*
 * Module implementing device ids.
 *
 * @flow
 */
import invariant from 'assert';
import * as cryptoSign from './crypto_sign';

export default class AccessToken {

  pub: string;
  priv: ?string;

  static ENTROPY_BYTES = cryptoSign.encodingLength;

  static create(options = {}) {
    const [secretKey, pubKey] = cryptoSign.generateKeyPair(options);
    return new AccessToken(pubKey.toString('hex'), secretKey.toString('hex'));
  }

  static import(json) {
    const obj = JSON.parse(json);
    return new AccessToken(obj.pub, obj.priv);
  }

  static importPub(pubKey) {
    return new AccessToken(pubKey);
  }

  constructor(pub: string, priv?: string) {
    this.pub = pub;
    this.priv = priv;
  }

  export(): string {
    const obj = {
      pub: this.pub,
      priv: this.priv,
    };
    return JSON.stringify(obj);
  }

  toString(): string {
    return this.pub;
  }

  sign(message: string): string {
    invariant(this.priv, 'no private key');
    const secret = new Buffer(this.priv, 'hex');
    return cryptoSign.sign(cryptoSign.sha256(message), secret).toString('hex');
  }

  verify(message: string, signatureHex: string): boolean {
    return cryptoSign.verify(
      cryptoSign.sha256(message),
      new Buffer(signatureHex, 'hex'),
      new Buffer(this.pub, 'hex')
    );
  }

  isValid(): boolean {
    if (this.priv) {
      const pubKey = cryptoSign.publicKeyFromSecret(new Buffer(this.priv, 'hex'));
      if (pubKey.toString('hex') !== this.pub) {
        return false;
      }
    }
    return !!this.pub && this.pub.length === 64;
  }
}
