import jwa from '../api/jwa';
import jwt from 'jsonwebtoken';

let log = require('./log')('routes:jwt');

/**
 * JWT Authorization middleware.
 *
 * @param {Function} method to invoke to fetch public key.
 */
export default function (method) {

  async function handle(req, res, next) {
    // Authorization header is required.
    let { authorization } = req.headers;
    if (!authorization) {
      log.error('Missing authorization header', req.path, req.method);
      // 401 = no header sent.
      res.sendStatus(401);
      return;
    }

    // Must be a scheme we understand.
    let [scheme, signature] = authorization.split(' ');
    if (scheme.toLowerCase() !== 'bearer') {
      log.error('Unknown authorization header type', req.path, req.method, scheme);
      res.sendStatus(403);
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

    let publicKey = await method(req, res);
    if (!publicKey) {
      log.error('Missing public key', req.path, req.method, scheme);
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

    req.signed = verified;
    next();
  }

  return function (req, res, next) {
    handle(req, res, next).catch(next);
  };
}
