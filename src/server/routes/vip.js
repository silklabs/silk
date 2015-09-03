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
const ID = Joi.string().hex().required();

export default function (ctx) {
  let routes = new Router();

  /**
   * Simplified JWT for "vip" routes which deal with accounts and other
   * endpoints which may not have completely initialized accounts.
   *
   * This will _not_ check against known public key values.
   */
  routes.use(PREFIX, jwtMiddleware(async (req) => {
    let unsafe = req.unsafeJwt;
    if (!unsafe) {
      throw new Error('Missing unsafe JWT');
    }

    let headers = unsafe.header;
    if (!headers) {
      throw new Error('Missing unsafe JWT headers');
    }

    let { id } = headers;
    Joi.assert(id, ID);
    return id;
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
      description('Password hash')
  };

  api.define({
    path: 'create',
    method: 'post',
    params: [],
    name: 'createAccount',
    description: 'Create a user account',
    output: Joi.object().keys({
      success: Joi.boolean().required()
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
      /**
       * We validate this above for all routes so we know it has been sent in
       * the correct format. At this point the publicKey has only been verified
       * to belong to the privateKey which signed the JWT.
       */
      publicKey: req.unsafeJwt.header.id,
      passwordHash: req.body.passwordHash
    });

    if (!account.error) {
      log.info('create account', account.id);
      res.respond({ success: true });
      return;
    }
    res.respond({ success: false });
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
