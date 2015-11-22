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

let log = require('log')('routes:vip');
const PREFIX = '/v1/vip/';

export default function (ctx) {
  let routes = new Router();

  /**
   * Simplified JWT for "vip" routes which deal with accounts and other
   * endpoints which may not have completely initialized accounts.
   *
   * This will _not_ check against known public key values.
   */
  routes.use(PREFIX, jwtMiddleware(ctx.nonce, async (publicKey) => {
    return publicKey;
  }));

  let api = expressApi(routes, {
    name: 'vip',
    prefix: PREFIX,
    description: `
      API methods for creating/logging in/authenticating user accounts
    `,
  });

  const COMMON_SCHEMA = {
    email: Joi.string().email().required().
      description('Users email address'),
    passwordHash: Joi.string().hex().min(64).required().
      description('Password hash')
  };

  const ACCESS_TOKEN_SCHEMA = Object.assign({}, COMMON_SCHEMA, {
    userAgent: Joi.string().required(),
  });

  api.define({
    path: 'create',
    method: 'post',
    params: [],
    name: 'createAccount',
    description: 'Create a user account',
    output: Joi.object().keys({
      success: Joi.boolean().required(),
      beaconUUID: Joi.string().guid(),
    }),
    input: Joi.object().keys(ACCESS_TOKEN_SCHEMA)
  }, async (req, res) => {
    let account = await ctx.accounts.create({
      // Where this key was created (i.e. iPhone 5s ...)
      // XXX: Should we infer this with another method?
      userAgent: req.body.userAgent,
      email: req.body.email,
      /**
       * We validate this above for all routes so we know it has been sent in
       * the correct format. At this point the publicKey has only been verified
       * to belong to the privateKey which signed the JWT.
       */
      publicKey: req.unsafeJwt.header.id,
      passwordHash: req.body.passwordHash
    });

    if (account.error) {
      log.verbose('Failed to create account', account);
      res.respond({ success: false });
      return;
    }
    log.info('create account', account.id);
    res.respond({
      success: true,
      beaconUUID: account.beaconUUID,
    });
  });

  api.define({
    path: 'sign_in',
    method: 'post',
    params: [],
    name: 'signIn',
    description: 'Sign into an account',
    output: Joi.object().keys({
      success: Joi.boolean().required(),
      beaconUUID: Joi.string().guid(),
    }),
    input: Joi.object().keys(ACCESS_TOKEN_SCHEMA)
  }, async (req, res) => {
    let account = await ctx.accounts.signIn({
      userAgent: req.body.userAgent,
      email: req.body.email,
      publicKey: req.unsafeJwt.header.id,
      passwordHash: req.body.passwordHash
    });

    if (account.error) {
      log.verbose('sign in failure', account);
      res.respond({ success: false });
      return;
    }
    // TODO: Notify user of new sign in
    log.info('sign in', account.id);
    res.respond({
      success: true,
      beaconUUID: account.beaconUUID,
    });
  });

  api.define({
    path: 'check_passsword',
    method: 'post',
    params: [],
    name: 'checkPassword',
    description: 'Authenticate with an existing account',
    output: Joi.object().keys({
      success: Joi.boolean().required()
    }),
    input: Joi.object().keys(COMMON_SCHEMA),
  }, async (req, res) => {
    let publicKey = req.unsafeJwt.header.id;
    let result = await ctx.accounts.checkPassword({
      email: req.body.email,
      publicKey: publicKey,
      passwordHash: req.body.passwordHash
    });
    if (!result.error) {
      log.info('authenticate', result.id);
      res.respond({ success: true });
      return;
    }
    res.respond({ success: false });
  });


  return api;
}
