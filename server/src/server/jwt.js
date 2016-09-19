/* @flow */

import invariant from 'assert';
import jwt from 'silk-jsonwebtoken';
import createLog from 'silk-log';

import jwa from './jwa';

import type { RouteNextFn, MiddlewareFn } from './express_types';

const log = createLog('routes:jwt');

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
  publicKeyProvider: PublicKeyProvider;
  signatureProvider: ?SignatureProvider;
};

export type MiddlewareOverrides = {
  signatureProvider: ?SignatureProvider;
};


/**
 * JWT Authorization middleware.
 */
export default function (options: MiddlewareOptions): MiddlewareFn {
  let {publicKeyProvider, signatureProvider} = options || {};
  let signatureProviderFn = signatureProvider || getSignature;


  if (typeof signatureProvider !== 'function') {
    signatureProvider = getSignature;
  }

  async function handle(req: any, res: any, next: RouteNextFn) {
    if (req.publicKey) {
      invariant(req.device);
      invariant(req.signed);
      next();
      return;
    }

    let signature = signatureProviderFn(req, res);

    if (typeof signature !== 'string') {
      res.sendStatus(401);
      return;
    }

    /**
     * Unsafely decode the JWT signature. As the name states you must not trust
     * any values here. It is used only in the process of looking up the "id" of
     * the client.
     */
    req.unsafeJwt = jwt.decode(signature, {
      complete: true,
    });

    let jwtHeader = req.unsafeJwt.header;
    if (!jwtHeader || !jwtHeader.id) {
      log.error('Invalid jwt header missing .header or .header.id');
      res.sendStatus(400);
      return;
    }

    let publicKey = await publicKeyProvider(jwtHeader.id, req, res);
    if (!publicKey) {
      log.debug('Could not find public key', req.path, req.method);
      res.sendStatus(403);
      return;
    }

    let verified;
    try {
      verified = jwt.verify(signature, new Buffer(publicKey, 'hex'), {
        algorithms: ['ed25519'],
        jwa,
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
        req.path || req.url,
        req.method,
        req.requestHash,
        verified.requestHash
      );
      res.sendStatus(400);
      return;
    }

    req.publicKey = publicKey;
    req.signed = verified;
    next();
  }

  return function (req: any, res: any, next: RouteNextFn) {
    handle(req, res, next).catch(next);
  };
}
