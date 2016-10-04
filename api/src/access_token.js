/*
 * Module implementing device ids.
 *
 * @flow
 */
import invariant from 'assert';
import base64url from 'base64url';
import crypto from 'crypto';
import {ed25519} from 'silk-crypto';
import uuid from 'uuid';

export default class AccessToken {

  pub: string;
  priv: ?string;

  static gen(): Promise<AccessToken> {
    return ed25519.genKeyPairHex()
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
      const pubKey = await ed25519.genVerifyingKeyFromSigningKeyHex(this.priv);
      return pubKey === this.pub;
    }
    return !!this.pub && this.pub.length === 2 * ed25519.KEY_BYTES;
  }

  genSign(message: string | Buffer): Promise<string> {
    const hash = crypto.createHash('sha256').update(message).digest();
    invariant(this.priv, 'no private key');
    return ed25519.genSignHex(hash, this.priv);
  }

  genVerify(
    message: string | Buffer,
    signature: string | Buffer,
  ): Promise<boolean> {
    return ed25519.genVerify(
      crypto.createHash('sha256').update(message).digest(),
      signature,
      this.pub
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
