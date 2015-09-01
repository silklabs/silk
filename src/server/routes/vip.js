/**
 * VIP routes share a common authorization model where the publicKey
 * is passed as part of the payloads and validated against a knowns set of keys.
 * Primarily this provides assurance that the issuer of the request owns the
 * private key.
 */

import { Router } from 'express';
import { expressApi } from 'api-schema';
import * as Joi from 'joi';
import bodyParser from 'body-parser';
import jwa from '../../api/jwa';
import jwt from 'jsonwebtoken';

let log = require('../log')('routes:vip');
const PREFIX = '/v1/vip/';

export default function (ctx) {
  let routes = new Router();
  routes.use(PREFIX, bodyParser.json());
  routes.use(PREFIX, (req, res, next) => {
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
      res.sendStatus(400);
      return;
    }

    // Must include public key in the payload for these methods.
    let { publicKey } = req.body;
    if (!publicKey) {
      log.error('Missing public key', req.path, req.method, scheme);
      res.sendStatus(400);
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

    req.signed = verified;
    next();
  });

  let api = expressApi(routes, {
    name: 'auth',
    prefix: PREFIX,
    description: `
      API methods for creating/logging in/authenticating user accounts
    `,
  });

  const COMMON_SCHEMA = {
    email: Joi.string().email().required().
      description('Users email address'),
    passwordHash: Joi.string().hex().min(64).required().
      description('Password hash'),
    publicKey: Joi.string().hex().required().
      description('ed25519 public key in hex')
  };

  api.define({
    path: 'create',
    method: 'post',
    params: [],
    name: 'createAccount',
    description: 'Create a user account',
    output: Joi.object().keys({
      id: Joi.string().required().description('Account id')
    }),
    input: Joi.object().keys(Object.assign({}, COMMON_SCHEMA, {
      userAgent: Joi.string().required(),
    }))
  }, async (req, res) => {
    let account = await ctx.accounts.create({
      // Where this key was created (i.e. iPhone 5s ...)
      // XXX: Should we infer this with another method?
      userAgent: req.body.userAgent,
      email: req.body.email,
      publicKey: req.body.publicKey,
      passwordHash: req.body.passwordHash
    });

    if (!account.error) {
      res.respond({ id: account.id });
      return;
    }
    res.status(400).send(account.error);
  });

  api.define({
    path: 'authenticate',
    method: 'post',
    params: [],
    name: 'authenticate',
    description: 'Authenticate with an existing account',
    output: Joi.object().keys({
      id: Joi.string().required().description('Account id'),
      expires: Joi.date().min('now').required()
    }),
    input: Joi.object().keys(COMMON_SCHEMA),
  }, async (req, res) => {
    let result = await ctx.accounts.authenticate({
      email: req.body.email,
      publicKey: req.body.publicKey,
      passwordHash: req.body.passwordHash
    });

    if (!result.error) {
      res.respond({ id: result.id, expires: result.expires});
      return;
    }
    res.status(400).send(result.error);
  });


  return api;
}
