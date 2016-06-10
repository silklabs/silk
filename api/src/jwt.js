/**
 * @flow
 */

import crypto from 'crypto';
import {sign} from 'silk-jsonwebtoken';
import uuid from 'uuid';

import jwa from './jwa';

import type {SignPayload} from 'silk-jsonwebtoken';

function jwtPayload(payload: string): SignPayload {
  return {
    // Unique id for this request.
    jti: uuid.v1(),
    // JSON representation of a string...
    iat: new Date().toJSON(),
    // sha256 of the json body...
    requestHash: crypto.createHash('sha256').update(payload).digest('hex'),
  };
}

export async function genJWTSignature(
  payload: string,
  secretKey: Buffer,
  headers: {[key: string]: string}
): Promise<string> {
  return sign(jwtPayload(payload), secretKey, {
    headers,
    algorithm: 'ed25519',
    jwa,
  });
}
