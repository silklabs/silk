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
import URL from 'url';

import Accounts from '../models/accounts';


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

  api.define({
    path: 'reset_password',
    method: 'post',
    params: [],
    name: 'resetPassword',
    description: 'Trigger a password reset (forgot password)',
    output: Joi.object().keys({
      success: Joi.boolean().required()
    }),
    input: Accounts.SCHEMA.resetPassword,
  }, async (req, res) => {
    let reset = await ctx.accounts.resetPassword(req.body);
    if (reset.error) {
      log.warn(`Password reset request fail`, reset.error);
      res.sendStatus(404);
      return;
    }

    let baseUrl = ctx.config.resetPassword.url;
    let parsed = URL.parse(baseUrl, true);
    parsed.query = parsed.query || {};
    delete parsed.search;

    parsed.query.token = reset.token;
    parsed.query.email = req.body.email;

    let passwordResetUrl = URL.format(parsed);

    await ctx.emailSender.resetPassword({
      email: req.body.email,
      url: passwordResetUrl,
    });

    res.respond({ success: true });
  });

  api.define({
    path: 'use_password_reset_token',
    method: 'post',
    params: [],
    name: 'usePasswordResetToken',
    description: 'Use the token provided by resetPassword to set a new password',
    output: Joi.object().keys({
      success: Joi.boolean().required()
    }),
    input: Accounts.SCHEMA.usePasswordResetToken,
  }, async (req, res) => {
    let result = await ctx.accounts.usePasswordResetToken(req.body);
    if (result.error) {
      log.warn(`Failed to use password reset token`, result.error);
      res.sendStatus(401);
      return;
    }
    res.respond(result);
  });

  return api;
}
