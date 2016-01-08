/* @flow */

import jwa from 'silk-api/src/jwa';
import jwt from 'jsonwebtoken';
import * as Joi from 'joi';
import createLog from 'log';

import type Nonce from './models/nonce';
import type { RouteNextFn, MiddlewareFn } from './express_types';

const log = createLog('routes:jwt');

/**
 * The "lifetime" of a token this value must be plus or minus within this amount
 * of time (translates to up to 2 minutes the token is valid) to allow for time
 * drift.
 */
const TOKEN_LIFETIME = 60 * 1000;

/**
 * Validation rules for the claim values of the JWT.
 */
const CLAIM_SCHEMA = Joi.object().keys({
  // A request unique value (UUID).
  jti: Joi.string().guid().required(),
  // Issued time (as json date).
  iat: Joi.date().required()
}).required().unknown(true);

/**
 * Validates the basic form of the claim such as presence of jti/iss and
 * ensuring the token was issued reasonably recently.
 */
function validateClaim(jwt) {
  Joi.assert(jwt, CLAIM_SCHEMA);
  let { jti, iat } = jwt;

  let now = Date.now();
  let issued = new Date(iat);
  let delta = Math.abs(Date.now() - issued.valueOf());

  if (delta > TOKEN_LIFETIME) {
    throw new Error(`
      Attmpted to use expired JWT token: ${jti}

        Now: ${new Date(now)}
        Issued: ${issued}
    `);
  }

  return jti;
}

function getSignature(req: any): ?string {
  // Authorization header is required.
  let { authorization } = req.headers;
  if (!authorization) {
    log.error('Missing authorization header', req.path, req.method);
    return null;
  }

  // Must be a scheme we understand.
  let [scheme, signature] = authorization.split(' ');
  if (scheme.toLowerCase() !== 'bearer') {
    log.error('Unknown authorization header type', req.path, req.method, scheme);
    return null;
  }

  return signature;
}

export type PublicKeyProvider = ((publicKey: string, req: any) => Promise<?string>);
export type SignatureProvider = ((req: any, res: any) => ?string);

type MiddlewareOptions = {
  nonce: Nonce;
  publicKeyProvider: PublicKeyProvider;
  signatureProvider: ?SignatureProvider;
};

export type MiddlewareOverrides = {
  signatureProvider: ?SignatureProvider
};


/**
 * JWT Authorization middleware.
 *
 * @param {Object} nonce database.
 * @param {Function} method to invoke to fetch public key.
 */
export default function (options: MiddlewareOptions): MiddlewareFn {
  let {nonce, publicKeyProvider, signatureProvider} = options || {};
  let signatureProviderFn = signatureProvider || getSignature;


  if (typeof signatureProvider !== 'function') {
    signatureProvider = getSignature;
  }

  async function handle(req: any, res: any, next: RouteNextFn) {
    let signature = signatureProviderFn(req, res);

    if (typeof signature !== 'string') {
      res.sendStatus(401);
      return;
    }

    /**
     * Unsafely decode the JWT signature as the name states you must not trust
     * any values here and is used only in the process of looking up the "id" of
     * the client.
     */
    req.unsafeJwt = jwt.decode(signature, {
      complete: true
    });

    let jwtHeader = req.unsafeJwt.header;
    if (!jwtHeader || !jwtHeader.id) {
      log.error('Invalid jwt header missing .header or .header.id');
      res.sendStatus(400);
      return;
    }

    let publicKey = await publicKeyProvider(jwtHeader.id, req, res);
    if (!publicKey) {
      log.error('Missing public key', req.path, req.method);
      res.sendStatus(403);
      return;
    }

    let verified;
    try {
      verified = jwt.verify(signature, publicKey, {
        algorithms: ['ed25519'],
        jwa
      });
    } catch (err) {
      log.error('JWT validation fail', req.path, req.method, err);
      // XXX: Should we send this error to the client?
      res.sendStatus(403);
      return;
    }

    if (!req.requestHash) {
      throw new Error('All requests must contain requestHash value');
    }

    if (req.requestHash !== verified.requestHash) {
      log.error(
        'Hash of body does not match signed value',
        req.path,
        req.method,
        req.requestHash,
        verified.requestHash
      );
      res.sendStatus(400);
      return;
    }

    // Validate the claim of the JWT....
    let jti = validateClaim(verified);

    // Check the nonce database...
    let jtiUsed = await nonce.check({ value: jti });
    if (jtiUsed) {
      log.info('Attempted to use existing JTI token', jti);
      res.sendStatus(400);
      return;
    }

    await nonce.create({
      value: jti,
      created: new Date(),
      /**
       * This ensures the JWT cannot be used in a replay attack.
       *
       * We set the expiry intentionally to twice the lifetime of the token to
       * allow some extra buffer since timing is somewhat fuzzy from machine to
       * machine.
       */
      expires: new Date(Date.now() + (TOKEN_LIFETIME * 2))
    });

    req.publicKey = publicKey;
    req.signed = verified;
    next();
  }

  return function (req: any, res: any, next: RouteNextFn) {
    handle(req, res, next).catch(next);
  };
}
