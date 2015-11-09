/* @flow */

/**
 * The account routes deal with operations on an account that has been created
 * previously (authenticated).
 */

import { Router } from 'express';
import { expressApi } from 'api-schema';
import * as Joi from 'joi';
import sharedRoutes from './shared';
import authorizeAccount from '../authorize_account';

import Devices from '../models/devices';

import type { RouteContext } from '../server';

let log = require('log')('routes:account');
const PREFIX = '/v1/account/';

export default function (ctx: RouteContext) {
  let routes = new Router();

  routes.use(PREFIX, authorizeAccount({
    nonce: ctx.nonce,
    accounts: ctx.accounts
  }));

  let api = expressApi(routes, {
    name: 'account',
    prefix: PREFIX,
    description: `
      Account manipulation (adding devices/etc...)
    `,
  });

  sharedRoutes(api, ctx);

  api.define({
    path: 'register_device',
    method: 'post',
    params: [],
    name: 'registerDevice',
    description: 'Create a user account',
    output: Joi.object().keys({
      success: Joi.boolean().required(),
      beaconUUID: Joi.string().guid(),
    }),
    input: Joi.object().keys({
      // publicKey of the _device_
      devicePublicKey: Joi.string().hex().required(),
      // type of the device...
      type: Devices.TYPE_SCHEMA,
      // name of the device...
      name: Devices.NAME_SCHEMA,
      // registration token to use...
      registrationToken: Joi.string().required(),
    }).required()
  }, async (req, res) => {

    // XXX: Some accounts may not have beaconUUID yet so update them to include
    // it as needed...
    if (!req.account.beaconUUID) {
      let beaconUUID = await ctx.accounts.setBeaconUUIDIfMissing(
        req.publicKey
      );

      if (!beaconUUID) {
        throw new Error(`
          Unexpectedly could not assign beaconUUID for ${req.publicKey}
        `);
      }
      req.account.beaconUUID = beaconUUID;
    }

    let result = await ctx.devices.register(
      req.publicKey,
      {
        // TODO: This is ugly figure out how to make this look better (passing
        // of object id).
        accountId: req.account._id.toString(),
        publicKey: req.body.devicePublicKey,
        name: req.body.name,
        type: req.body.type,
        registrationToken: req.body.registrationToken
      }
    );

    if (!result.error) {
      log.info('registered device', req.account.id);
      res.respond({
        success: true,
        beaconUUID: req.account.beaconUUID
      });
      return;
    }
    log.verbose('Failed to register device', result, req.account);
    res.respond({ success: false });
  });

  api.define({
    path: 'list_devices',
    method: 'post',
    params: [],
    name: 'listDevices',
    description: 'List all registered devices',
    output: Joi.object().keys({
      devices: Joi.array().required().items(Joi.object().keys({
        name: Devices.NAME_SCHEMA,
        publicKey: Joi.string().hex().required()
      }))
    }),
    input: Joi.object().keys({
      // TODO: Pagination?
    }).required()
  }, async (req, res) => {
    let list = await ctx.devices.findAllByAccount(req.account._id);
    list = list.map((device) => {
      return {
        name: device.name,
        publicKey: device.accessToken.publicKey
      };
    });

    res.respond({ devices: list });
  });


  api.define({
    path: 'unregister_device',
    method: 'post',
    params: [],
    name: 'unregisterDevice',
    description: 'Remove device from the account',
    output: Joi.object().keys({
      success: Joi.boolean().required()
    }),
    input: Joi.object().keys({
      devicePublicKey: Joi.string().hex().required()
    }).required()
  }, async (req, res) => {
    let result = await ctx.devices.unregister({
      publicKey: req.body.devicePublicKey
    });

    if (!result || result.error) {
      log.info('Failed unregistering device for account', );
      res.respond({ success: false });
      return;
    }

    res.respond({ success: true });
  });

  return api;
}
