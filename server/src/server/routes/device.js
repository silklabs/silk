/**
 * The account routes deal with operations on an account that has been created
 * previously (authenticated).
 *
 * @flow
 */

import { Router } from 'express';
import { expressApi } from 'api-schema';
import * as Joi from 'joi';
import createLog from 'log';

import sharedRoutes from './shared';
import authorizeDevice from '../authorize_device';

import type { ExpressRoutes } from 'api-schema';
import type { RouteContext } from '../server';

const log = createLog('routes:device');
const PREFIX = '/v1/device/';

export default function (ctx: RouteContext): ExpressRoutes {
  let routes = new Router();

  routes.use(PREFIX, authorizeDevice({
    nonce: ctx.nonce,
    devices: ctx.devices,
  }));

  let api = expressApi(routes, {
    name: 'device',
    prefix: PREFIX,
    description: `
      API calls for devices...
    `,
  });

  sharedRoutes(api, 'device', ctx);

  api.define({
    path: 'complete_registration',
    method: 'post',
    params: [],
    name: 'completeRegistration',
    description: 'Complete registration of the deivce',
    output: Joi.object().keys({
      success: Joi.boolean().required(),
      beaconUUID: Joi.string().guid()
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
      res.respond({
        success: true,
        beaconUUID: account.beaconUUID
      });
      return;
    }
    log.verbose('Failed to register device', req.device.accountId);
    res.respond({ success: false });
  });

  return api;
}
