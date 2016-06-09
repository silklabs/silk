/*
 * Module implementing device ids.
 *
 * @flow
 */
import invariant from 'assert';
import crypto from 'crypto';

import cryptoSign from './crypto_sign';
import {genJWTSignature} from './jwt';

export default class AccessToken {

  pub: string;
  priv: ?string;

  static ENTROPY_BYTES = cryptoSign.encodingLength;

  static gen(
    options: {entropy?: Buffer;} = {}
  ): Promise<AccessToken> {
    const [secretKey, pubKey] = cryptoSign.generateKeyPair(options);
    return Promise.resolve(
      new AccessToken(pubKey.toString('hex'), secretKey.toString('hex'))
    );
  }

  static import(jsonString: string): AccessToken {
    const obj = JSON.parse(jsonString);
    return new AccessToken(obj.pub, obj.priv);
  }

  static importPub(pubKey: string): AccessToken {
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

  async genIsValid(): Promise<boolean> {
    if (this.priv) {
      const pubKey = cryptoSign.publicKeyFromSecret(
        new Buffer(this.priv, 'hex')
      );
      if (pubKey.toString('hex') !== this.pub) {
        return false;
      }
    }
    return !!this.pub && this.pub.length === 64;
  }

  async genSign(message: string): Promise<string> {
    invariant(this.priv, 'no private key');
    const secret = new Buffer(this.priv, 'hex');
    // We're double-hashing here because cryptoSign also hashes the input.
    const hash = crypto.createHash('sha256').update(message).digest();
    return cryptoSign.sign(hash, secret).toString('hex');
  }

  async genVerify(message: string, signatureHex: string): Promise<boolean> {
    return cryptoSign.verify(
      crypto.createHash('sha256').update(message).digest(),
      new Buffer(signatureHex, 'hex'),
      new Buffer(this.pub, 'hex')
    );
  }

  /**
   * Create a JWT client token for requests.
   */
  genSignRequest(
    method: string,
    urlPath: string,
    body?: string
  ): Promise<string> {
    let payload = `${urlPath}\n${method.toLowerCase()}`;
    if (typeof body === 'string') {
      const hash = crypto.createHash('sha256').update(body).digest('hex');
      payload += `\n${hash}`;
    }
    const headers = {
      // The server will identify us based on the public key which
      // is sent in the clear here as an "id". Then server _must_
      // validate this against known public keys.
      id: this.pub,
    };
    invariant(this.priv);
    const secret = new Buffer(this.priv, 'hex');
    return genJWTSignature(payload, secret, headers);
  }

}
