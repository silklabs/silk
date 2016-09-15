/**
 * The account routes deal with operations on an account that has been created
 * previously (authenticated).
 *
 * @flow
 */

import invariant from 'assert';
import { Router } from 'express';
import * as Joi from 'joi';
import { expressApi } from 'silk-api-schema';
import createLog from 'silk-log';

import Devices from '../models/devices';
import sharedRoutes from './shared';
import authorizeDevice from '../authorize_device';
import authorizeUnregisteredDevice from '../authorize_unregistered_device';

import type { ExpressRoutes } from 'silk-api-schema';
import type {
  GetFactoryResetMessageOutput,
  GetSasForSignalingOutput,
  CompleteRegistrationOutput,
  UnregisterOutput,
  AcknowledgeMessageOutput,
} from 'silk-api/src/gen/device';
import type { RouteContext } from '../server';

const log = createLog('routes:device');
const PREFIX = '/v1/device/';

const FACTORY_RESET_MESSAGE_PATH = 'factory_reset_message';

export default function (ctx: RouteContext): ExpressRoutes {
  const {devices} = ctx;
  const routes = new Router();

  // Special route that allows unregistered devices.
  routes.use(
    `${PREFIX}${FACTORY_RESET_MESSAGE_PATH}`,
    authorizeUnregisteredDevice({devices}),
  );

  routes.use(PREFIX, authorizeDevice({devices}));

  const api = expressApi(routes, {
    name: 'device',
    prefix: PREFIX,
    description: `
      API calls for devices...
    `,
  });

  sharedRoutes(api, 'device', ctx);

  api.define({
    path: FACTORY_RESET_MESSAGE_PATH,
    method: 'post',
    params: [],
    name: 'getFactoryResetMessage',
    description:
      `Return a factory reset message for this device if it was unregistered`,

    input: Joi.object(),
    output: Joi.object().keys({
      factoryResetMessage: Devices.ONION_SCHEMA.optional(),
    }).required(),
  }, async (req, res) => {
    const {device} = req;
    const factoryResetMessage = device.factoryResetMessage || null;
    const output: GetFactoryResetMessageOutput = {factoryResetMessage};
    res.send(output);
  });

  api.define({
    path: 'sas_signaling_servers',
    method: 'post',
    params: [],
    name: 'getSasForSignaling',
    description:
      `Return SAS credentials for querying available signaling servers`,

    // This has no real input for the time being ...
    input: Joi.object(),
    output: Joi.object().keys({
      /* TODO: Upgrade flow support to allow this ... */
      /*
      sas: Joi.array().items(Joi.array().ordered(
        Joi.string().required(),
        Joi.object().keys({
          sv: Joi.string().required(),
          sp: Joi.string().required(),
          tn: Joi.string().required(),
          st: Joi.string().required(),
          se: Joi.string().required(),
          sig: Joi.string().required(),
        }).required()
      ))*/
      publicUrl: Joi.string().optional(), // not requried
      sas: Joi.array().items(Joi.any()).required(),
      messages: Joi.array().items(Joi.string()).required(),
    }).required(),
  }, async (req, res) => {
    const messages = await devices.getMessages(req.publicKey);
    if (messages.error) {
      log.warn('Failed to get messages', req.publicKey, messages.error);
      res.sendStatus(404);
      return;
    }

    // 6 hours in the future ...
    let expiration = new Date(Date.now() + 1000 * 60 * 60 * 6);

    // Permissive sas which allows reading the entire table ...
    let sas = ctx.sasSigner.createTableSignatures(
      'sigservers',
      { expiration, signedPermissions: 'r' }
    );

    const output: GetSasForSignalingOutput = {
      publicUrl: ctx.config.signaling.publicUrl,
      sas,
      messages,
    };

    res.respond(output);
  });

  api.define({
    path: 'complete_registration',
    method: 'post',
    params: [],
    name: 'completeRegistration',
    description: 'Complete registration of the deivce',
    output: Joi.object().keys({
      success: Joi.boolean().required(),
      accountDeviceNumber: Devices.ACCOUNT_DEVICE_NUMBER_SCHEMA,
      beaconUUID: Joi.string().guid(),
    }).required(),
    input: Joi.object().keys({
      // _account_ public key...
      registrarPublicKey: Devices.PUBLIC_KEY_SCHEMA,
      // registration token to use...
      registrationToken: Joi.string(),
    }).required(),
  }, async (req, res) => {
    const {registrarPublicKey, registrationToken} = req.body;
    // First we need to find the account that this device belongs to so we can
    // validate the registration token.
    const account = await ctx.accounts.findByPublicKey(registrarPublicKey);

    if (!account) {
      // No account...
      log.warn(
        `Attempted to register device to non-existant account`,
        req.device.accessToken.publicKey,
        registrarPublicKey,
        registrationToken,
      );
      res.sendStatus(400);
      return;
    }

    if (req.device.accountId.toString() !== account._id.toString()) {
      // Wrong account...
      log.warn(
        `Attempted to register device to the wrong account`,
        req.device.accessToken.publicKey,
        req.device.accountId,
        account._id,
        registrarPublicKey,
        registrationToken,
      );
      res.sendStatus(403);
      return;
    }

    let result = await devices.validateRegistration(registrarPublicKey, {
      publicKey: req.device.accessToken.publicKey,
      registrationToken: registrationToken,
    });

    if (result.error) {
      log.verbose('Failed to register device', req.device.accountId);
      const output: CompleteRegistrationOutput = {
        success: false,
        accountDeviceNumber: null,
        beaconUUID: null,
      };
      res.respond(output);
      return;
    }

    log.info('validated registration', req.device.accountId);
    invariant(result.accountDeviceNumber);

    const output: CompleteRegistrationOutput = {
      success: true,
      accountDeviceNumber: result.accountDeviceNumber,
      beaconUUID: account.beaconUUID,
    };

    res.respond(output);
  });

  api.define({
    path: 'unregister',
    method: 'post',
    params: [],
    name: 'unregister',
    description: 'Remove this device from the account',
    input: Joi.object().keys({
      factoryResetMessage: Devices.ONION_SCHEMA.required(),
    }).required(),
    output: Joi.object().keys({
      success: Joi.boolean().required(),
    }).required(),
  }, async (req, res) => {
    const result = await devices.unregister({
      publicKey: req.publicKey,
      factoryResetMessage: req.body.factoryResetMessage,
    });

    if (result.error) {
      log.warn('Failed to unregister device', req.publicKey, result.error);
      const output: UnregisterOutput = {success: false};
      res.respond(output);
      return;
    }

    const output: UnregisterOutput = {success: true};
    res.respond(output);
  });

  api.define({
    path: 'message_ack',
    method: 'post',
    params: [],
    name: 'acknowledgeMessage',
    description: 'Acknowledge processing the oldest message',
    input: Joi.object().required(),
    output: Joi.object().required(),
  }, async (req, res) => {
    const result = await devices.acknowledgeMessage(req.publicKey);
    if (result.error) {
      log.warn('Failed to acknowledge message', req.publicKey, result.error);
      res.sendStatus(404);
      return;
    }
    const output: AcknowledgeMessageOutput = {};
    res.respond(output);
  });

  return api;
}
