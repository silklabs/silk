/**
 * @flow
 */

declare module 'jsonwebtoken' {

  declare type SignPayload = {
    jti: string;
    iat: string;
    // XXX: This is a type specific to use and not to JWT in general.
    requestHash: ?string;
  };

  declare type SignOptions = {
    algorithm: string;
    headers: {[key: string]: any};
    jwa: any; // XXX: Type this?
  }

  declare type VerifyOptions = {
    algorithms: Array<string>;
    jwa: any;
  }

  declare type DecodeOptions = {
    complete: bool;
  }

  declare function sign(payload: SignPayload, privateKey: string, options: SignOptions): string;
  declare function verify(token: string, publicKey: string, options: VerifyOptions): {[key: string]: string};
  declare function decode(token: string, options: DecodeOptions): {[key: string]: string};
}
