/**
 * VIP routes share a common authorization model where the publicKey
 * is passed as part of the payloads and validated against a knowns set of keys.
 * Primarily this provides assurance that the issuer of the request owns the
 * private key.
 *
 * @flow
 */

import invariant from 'assert';
import { Router } from 'express';
import * as Joi from 'joi';
import { expressApi } from 'silk-api-schema';
import createLog from 'silk-log';
import URL from 'url';
import querystring from 'querystring';
import { default as fetch, Headers } from 'silk-fetch';

import jwtMiddleware from '../jwt';
import Accounts from '../models/accounts';

import type { ExpressRoutes } from 'silk-api-schema';
import type { RouteContext } from '../server';

const log = createLog('routes:vip');
const PREFIX = '/v1/vip/';

async function GoogleIdTokenToUserId(idToken: string): Promise<string> {
  const urlBase = 'https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=';
  const res = await fetch(urlBase + idToken);
  if (res.status !== 200) {
    throw new Error(`Failed to fetch tokeninfo: ${res.status}: ${res.statusText}`);
  }
  const tokenInfo = await res.json();
  if (typeof tokenInfo !== 'object' || typeof tokenInfo.sub !== 'string') {
    throw new Error('Google tokeninfo invalid');
  }
  return tokenInfo.sub;
}

async function PandoEncryptIdToUserId(encryptId: string): Promise<string> {
  const urlBase = 'https://id-test.fuhu.org/id/accounts/inspector/encryptid?encryptId=';
  const options = {
    method: 'GET',
    headers: new Headers({
      'Content-Type': 'application/json',
      'apikey': '77a7be5a-dddf-4d65-a31f-8de0221c5d85',
    }),
  };
  const res = await fetch(urlBase + encryptId, options);
  if (res.status !== 200) {
    throw new Error(`Failed to validate encryptId: ${res.status}: ${res.statusText}`);
  }
  const info = await res.json();
  if (typeof info !== 'object' || info.isValidated !== true) {
    throw new Error('Invalid encryptId');
  }
  return encryptId; // This is also the unique account id
}

const tokenToUserId = {
  google: GoogleIdTokenToUserId,
  pando: PandoEncryptIdToUserId,
};

export default function (ctx: RouteContext): ExpressRoutes {
  let routes = new Router();

  /**
   * Simplified JWT for "vip" routes which deal with accounts and other
   * endpoints which may not have completely initialized accounts.
   *
   * This will _not_ check against known public key values.
   */

  routes.use(PREFIX, jwtMiddleware({

    signatureProvider: null,
    publicKeyProvider: async publicKey => publicKey,
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
      description('Password hash'),
  };

  const SIGNIN_WITH_PASSWORD_SCHEMA = Object.assign({}, COMMON_SCHEMA, {
    userAgent: Joi.string().required(),
  });

  const ACCOUNT_RESPONSE_SCHEMA = Object.assign({}, {
    success: Joi.boolean().required(),
    beaconUUID: Joi.string().guid(),
    userId: Joi.string(),
  });

  const SIGNIN_WITH_TOKEN_SCHEMA = Object.assign({}, {
    source: Joi.string().only(Object.keys(tokenToUserId)).required(),
    token: Joi.string().required(),
    userAgent: Joi.string().required(),
  });


  api.define({
    path: 'sign_in_token',
    method: 'post',
    params: [],
    name: 'signInWithToken',
    description: 'Sign into an account using a token',
    output: Joi.object().keys(ACCOUNT_RESPONSE_SCHEMA),
    input: Joi.object().keys(SIGNIN_WITH_TOKEN_SCHEMA),
  }, async (req, res) => {

    const {source, token, userAgent} = req.body;

    if (!tokenToUserId[source]) {
      log.warn(`Unknown account source`, source);
      res.sendStatus(400);
      return;
    }

    const sourceAccountId = await tokenToUserId[source](token);

    // Generate an id that's unique across all account sources
    const uniqueAccountId = `${source}-${sourceAccountId}`;

    const account = await ctx.accounts.signInByToken({
      userAgent,
      uniqueAccountId,
      publicKey: req.unsafeJwt.header.id,
    });

    if (account.error) {
      log.verbose('signInByToken in failure', account);
      res.respond({ success: false });
      return;
    }

    if (account.created) {
      log.info('created new token account', account.id);
    } else {
      // TODO: Notify user of new sign in
      log.info('token sign in', account.id);
    }

    res.respond({
      success: true,
      beaconUUID: account.beaconUUID,
      userId: account.id,
    });
  });

  api.define({
    path: 'create',
    method: 'post',
    params: [],
    name: 'createAccount',
    description: 'Create a user account',
    output: Joi.object().keys(ACCOUNT_RESPONSE_SCHEMA),
    input: Joi.object().keys(SIGNIN_WITH_PASSWORD_SCHEMA),
  }, async (req, res) => {
    let account = await ctx.accounts.create({
      userAgent: req.body.userAgent,
      email: req.body.email,
      /**
       * We validate this above for all routes so we know it has been sent in
       * the correct format. At this point the publicKey has only been verified
       * to belong to the privateKey which signed the JWT.
       */
      publicKey: req.unsafeJwt.header.id,
      passwordHash: req.body.passwordHash,
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
      userId: account.id,
    });
  });

  api.define({
    path: 'sign_in',
    method: 'post',
    params: [],
    name: 'signIn',
    description: 'Sign into an account',
    output: Joi.object().keys(ACCOUNT_RESPONSE_SCHEMA),
    input: Joi.object().keys(SIGNIN_WITH_PASSWORD_SCHEMA),
  }, async (req, res) => {
    let account = await ctx.accounts.signIn({
      userAgent: req.body.userAgent,
      email: req.body.email,
      publicKey: req.unsafeJwt.header.id,
      passwordHash: req.body.passwordHash,
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
      userId: account.id,
    });
  });

  api.define({
    path: 'check_passsword',
    method: 'post',
    params: [],
    name: 'checkPassword',
    description: 'Authenticate with an existing account',
    output: Joi.object().keys({
      success: Joi.boolean().required(),
    }),
    input: Joi.object().keys(COMMON_SCHEMA),
  }, async (req, res) => {
    let publicKey = req.unsafeJwt.header.id;
    let result = await ctx.accounts.checkPassword({
      email: req.body.email,
      publicKey: publicKey,
      passwordHash: req.body.passwordHash,
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
      success: Joi.boolean().required(),
    }),
    input: Accounts.SCHEMA.resetPassword,
  }, async (req, res) => {
    let reset = await ctx.accounts.resetPassword(req.body);
    if (reset.error) {
      log.warn(`Password reset request fail`, reset.error);
      res.sendStatus(404);
      return;
    }

    /**
     * Limit the number of times we allow a reset email to be sent to once per
     * token period. This prevents abuse while still allowing an idempontent
     * operation.
     */
    if (reset.newToken) {
      let baseUrl = ctx.config.resetPassword.url;
      let parsed = URL.parse(baseUrl, true);
      invariant(reset.token);
      let hashParams = {
        token: reset.token,
        email: req.body.email,
      };

      parsed.hash = parsed.hash || '';
      parsed.hash += `?${querystring.stringify(hashParams)}`;

      let passwordResetUrl = URL.format({
        host: parsed.host,
        pathname: parsed.pathname,
        query: parsed.query,
        hash: parsed.hash,
      });

      await ctx.emailSender.resetPassword({
        email: req.body.email,
        url: passwordResetUrl,
      });
    }

    res.respond({ success: true });
  });

  api.define({
    path: 'use_password_reset_token',
    method: 'post',
    params: [],
    name: 'usePasswordResetToken',
    description: 'Use the token provided by resetPassword to set a new password',
    output: Joi.object().keys({
      success: Joi.boolean().required(),
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
