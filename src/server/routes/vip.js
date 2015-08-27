/**
 * VIP routes share a common authorization model where the publicKey
 * is passed as part of the payloads and validated against a knowns set of keys.
 * Primarily this provides assurance that the issuer of the request owns the
 * private key.
 */

import { Router } from 'express';
import { expressApi } from 'api-schema';
import * as Joi from 'joi';
import jwtMiddleware from '../jwt';

let log = require('../log')('routes:vip');
const PREFIX = '/v1/vip/';

export default function (ctx) {
  let routes = new Router();
  routes.use(PREFIX, jwtMiddleware(async (req) => {
    // Must include public key in the payload for these methods.
    let { publicKey } = req.body;
    return publicKey;
  }));

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
      log.info('sign in', account.id);
      res.respond({ id: account.id });
      return;
    }
    res.status(400).send(account.error);
  });

  api.define({
    path: 'check_passsword',
    method: 'post',
    params: [],
    name: 'checkPassword',
    description: 'Authenticate with an existing account',
    output: Joi.object().keys({
      id: Joi.string().required().description('Account id')
    }),
    input: Joi.object().keys(COMMON_SCHEMA),
  }, async (req, res) => {
    let result = await ctx.accounts.checkPassword({
      email: req.body.email,
      publicKey: req.body.publicKey,
      passwordHash: req.body.passwordHash
    });

    if (!result.error) {
      log.info('authenticate', result.id);
      res.respond({ id: result.id });
      return;
    }
    res.status(400).send(result.error);
  });


  return api;
}
