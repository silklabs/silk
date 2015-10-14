/**
 * The account routes deal with operations on an account that has been created
 * previously (authenticated).
 */

import { Router } from 'express';
import { expressApi } from 'api-schema';
import * as Joi from 'joi';
import jwtMiddleware from '../jwt';

let log = require('log')('routes:device');
const PREFIX = '/v1/device/';

export default function (ctx) {
  let routes = new Router();

  routes.use(PREFIX, jwtMiddleware(ctx.nonce, async (publicKey, req) => {
    let device = await ctx.devices.findByPublicKey({
      publicKey
    });

    if (!device || device .error) {
      log.info(`Unauthorized public key at ${req.url}`, publicKey);
      return null;
    }

    req.device = device ;
    req.publicKey = publicKey;
    return publicKey;
  }));

  let api = expressApi(routes, {
    name: 'account',
    prefix: PREFIX,
    description: `
      API calls for devices...
    `,
  });

  api.define({
    path: 'complete_registration',
    method: 'post',
    params: [],
    name: 'completeRegistration',
    description: 'Complete registration of the deivce',
    output: Joi.object().keys({
      success: Joi.boolean().required()
    }),
    input: Joi.object().keys({
      // _account_ public key...
      registrarPublicKey: Joi.string().hex().required(),
      // registration token to use...
      registrationToken: Joi.string()
    }).required()
  }, async (req, res) => {

    // First we need to find the account that this device belongs to so we can
    // validate the registration token.
    let account = await ctx.accounts.findByPublicKey({
      publicKey: req.body.registrarPublicKey
    });

    if (!account) {
      // No account...
      log.info(
        `Attempted to register device to non-existant account`, account.id
      );
      res.sendStatus(400);
      return;
    }

    let result = await ctx.devices.validateRegistration(req.body.registrarPublicKey, {
      publicKey: req.device.accessToken.publicKey,
      registrationToken: req.body.registrationToken
    });

    if (!result.error) {
      log.info('validated registration', req.device.accountId);
      res.respond({ success: true });
      return;
    }
    log.verbose('Failed to register device', req.device.accountId);
    res.respond({ success: false });
  });

  return api;
}
