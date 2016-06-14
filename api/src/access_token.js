/*
 * Module implementing device ids.
 *
 * @flow
 */
import invariant from 'assert';
import base64url from 'base64url';
import crypto from 'crypto';
import uuid from 'uuid';

import cryptoSign from './crypto_sign';

export default class AccessToken {

  pub: string;
  priv: ?string;

  static ENTROPY_BYTES = cryptoSign.encodingLength;

  static gen(
    options: {entropy?: Buffer;} = {}
  ): Promise<AccessToken> {
    return cryptoSign.genKeyPair(options)
      .then(([priv, pub]) => new AccessToken(pub, priv));
  }

  static import(jsonString: string): AccessToken {
    const obj = JSON.parse(jsonString);
    return new AccessToken(obj.pub, obj.priv);
  }

  static importPub(pubKey: string): AccessToken {
    return new AccessToken(pubKey);
  }

  constructor(pub: string, priv?: ?string) {
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
      const pubKey = await cryptoSign.genPublicKeyFromSecret(this.priv);
      if (pubKey.toString('hex') !== this.pub) {
        return false;
      }
    }
    return !!this.pub && this.pub.length === 64;
  }

  async genSign(message: string): Promise<string> {
    invariant(this.priv, 'no private key');
    const secret = new Buffer(this.priv, 'hex');
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

    // Construct the jsonwebtoken ourselves so we can use our own signing
    // algorithm (ed25519) and implementation (JS, native, etc.)
    const jwtHeader = {
      typ: 'JWT',
      alg: 'ed25519',
      // The server will identify us based on the public key which
      // is sent in the clear here as an "id". Then server _must_
      // validate this against known public keys.
      id: this.pub,
    };
    const jwtPayload = {
      // Unique id for this request.
      jti: uuid.v4(),
      // JSON representation of a string...
      iat: new Date().toJSON(),
      // sha256 of the json body...
      requestHash: crypto.createHash('sha256').update(payload).digest('hex'),
    };
    const encodedHeader = base64url(JSON.stringify(jwtHeader), 'utf8');
    const encodedPayload = base64url(JSON.stringify(jwtPayload), 'utf8');
    const securedInput = `${encodedHeader}.${encodedPayload}`;
    return this.genSign(securedInput).then((signatureHex) => {
      const signature = base64url(new Buffer(signatureHex, 'hex'));
      return `${securedInput}.${signature}`;
    });
  }

}
