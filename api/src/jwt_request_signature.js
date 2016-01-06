/**
 * This module implements our core JWT functionality for clients.
 *
 * @flow
 */

import {sign} from 'jsonwebtoken';
import uuid from 'uuid';

import jwa from './jwa';
import { sha256 } from './util';

import type AccessToken from './access_token';
import type {SignPayload} from 'jsonwebtoken';

function jwtPayload(canonicalReq: string): SignPayload {
  return {
    // Unique id for this request.
    jti: uuid.v1(),
    // JSON representation of a string...
    iat: new Date().toJSON(),
    // sha256 of the json body...
    requestHash: sha256(canonicalReq)
  };
}

/**
 * Generate a signature which does not include a http body.
 */
export function signature(
  accessToken: AccessToken,
  method: string,
  url: string
): string {
  let canonicalReq = `${url}\n${method.toLowerCase()}`;

  if (typeof accessToken.priv !== 'string') {
    throw new Error(`Access token must have private key`);
  }

  let priv: string = accessToken.priv;
  return sign(jwtPayload(canonicalReq), priv, {
    headers: {
      id: accessToken.pub
    },
    algorithm: 'ed25519',
    jwa: jwa,
  });
}

/**
 * Create a JWT client token for requests which include a http body.
 *
 * NOTE: This method intentionally is separate from the cusion method to generate
 * a signature without a http body to keep things simple.
 */
export function bodySignature(
  accessToken: AccessToken,
  method: string,
  url: string,
  body: string,
): string {
  if (typeof accessToken.priv !== 'string') {
    throw new Error(`Access token must have private key`);
  }
  let priv: string = accessToken.priv;
  let canonicalReq = `${url}\n${method.toLowerCase()}\n${sha256(body)}`;
  return sign(jwtPayload(canonicalReq), priv, {
    /**
     * Remember headers are _not_ signed do not trust them and do not put
     * values in here that are implicitly assumed to be verified.
     */
    headers: {
      /**
       * The server will identify us based on the public key. We send it is
       * sent in the clear here as an "id" then server _must_ validate this
       * against known public keys.
       */
      id: accessToken.toString()
    },
    algorithm: 'ed25519',
    jwa: jwa
  });
}
