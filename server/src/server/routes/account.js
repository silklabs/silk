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

import sharedRoutes from './shared';
import authorizeAccount from '../authorize_account';
import Accounts from '../models/accounts';
import Devices from '../models/devices';

import type { ExpressRoutes } from 'silk-api-schema';
import type {
  WhoamiOutput,
  RegisterDeviceOutput,
  ListDevicesOutput,
  UnregisterDeviceOutput,
  QueryMetricsOutput,
  GetSasForDeviceSignalingOutput,
  ListClientsOutput,
  PostMessageOutput,
  RevokeClientOutput,
  SetClientUserAgentOutput,
} from 'silk-api/src/gen/account';

import type { RouteContext } from '../server';
import type {Record as AccountRecord} from '../models/accounts';
import type {Record as DeviceRecord} from '../models/devices';

const log = createLog('routes:account');

const PREFIX = '/v1/account/';

/**
 * NOTE: I would like to bake the concept of scopes into api define soon.
 */
const METRICS_SCOPES = 'metrics:query';

export default function (ctx: RouteContext): ExpressRoutes {
  let routes = new Router();

  routes.use(PREFIX, authorizeAccount({
    accounts: ctx.accounts,
  }));

  let api = expressApi(routes, {
    name: 'account',
    prefix: PREFIX,
    description: `
      Account manipulation (adding devices/etc...)
    `,
  });

  sharedRoutes(api, 'account', ctx);

  // XXX: This method is potentially dangerous but in various situations we need
  // to refer to an account by it's id rather than individual access token.
  api.define({
    path: 'whoami',
    method: 'post',
    params: [],
    name: 'whoami',
    description: 'Get basic details about the current account',
    input: Joi.object(),
    output: Joi.object().keys({
      accountId: Accounts.PUBLIC_KEY_SCHEMA,
    }).required(),
  }, async (req, res) => {
    const output: WhoamiOutput = {
      accountId: req.account._id.toString(),
    };
    res.respond(output);
  });

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
      devicePublicKey: Devices.PUBLIC_KEY_SCHEMA,
      // type of the device...
      type: Devices.TYPE_SCHEMA,
      // name of the device...
      name: Devices.NAME_SCHEMA,
      // registration token to use...
      registrationToken: Joi.string().required(),
    }).required(),
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
        registrationToken: req.body.registrationToken,
      }
    );

    if (result.error) {
      log.warn('Failed to register device', result, req.account);
      const output: RegisterDeviceOutput = {
        success: false,
        beaconUUID: null,
      };
      res.respond(output);
      return;
    }

    log.info('registered device', req.account.id);
    const output = {
      success: true,
      beaconUUID: req.account.beaconUUID,
    };
    res.respond(output);
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
        type: Devices.TYPE_SCHEMA,
        registered: Joi.boolean().required(),
        accountDeviceNumber:
          Devices.ACCOUNT_DEVICE_NUMBER_SCHEMA.allow(0).required(),
        publicKey: Devices.PUBLIC_KEY_SCHEMA,
        deviceId: Devices.PUBLIC_KEY_SCHEMA,
        lastSeenAt: Joi.date().required(),
      })),
    }),
    input: Joi.object().keys({
      // TODO: Pagination?
    }).required(),
  }, async (req, res) => {
    const recordList: Array<DeviceRecord> =
      await ctx.devices.findAllByAccount(req.account._id);
    const devices = recordList.map((device) => {
      invariant(device.registration);
      return {
        name: device.name,
        type: device.type,
        registered: device.registration.complete,
        accountDeviceNumber: device.registration.accountDeviceNumber || 0,
        publicKey: device.accessToken.publicKey,
        deviceId: device.accessToken.publicKey,
        // TODO: Implement for real but this stub will let us move on for now.
        lastSeenAt: (new Date()).toString(),
      };
    });

    const output: ListDevicesOutput = {devices};
    res.respond(output);
  });

  api.define({
    path: 'unregister_device',
    method: 'post',
    params: [],
    name: 'unregisterDevice',
    description: 'Remove device from the account',
    output: Joi.object().keys({
      success: Joi.boolean().required(),
    }),
    input: Joi.object().keys({
      devicePublicKey: Devices.PUBLIC_KEY_SCHEMA,
      factoryResetMessage: Devices.ONION_SCHEMA.required(),
    }).required(),
  }, async (req, res) => {
    const accountId = req.account._id;
    const {devicePublicKey: publicKey, factoryResetMessage} = req.body;

    const valid = await ctx.devices.belongsToAccount(accountId, publicKey);
    if (!valid) {
      log.warn(`Account '${accountId}' is attempting to unregister device ` +
               `'${publicKey}' that it doesn't own`);
      res.sendStatus(403);
      return;
    }

    let result = await ctx.devices.unregister({
      publicKey,
      factoryResetMessage,
    });

    const output: UnregisterDeviceOutput = {success: false};

    if (result.error) {
      log.warn('Failed unregistering device for account', result);
      res.respond(output);
      return;
    }

    output.success = true;
    res.respond(output);
  });

  api.define({
    path: 'metrics/query',
    method: 'post',
    params: [],
    name: 'queryMetrics',
    description: 'Query metrics /w influxql',
    // NOTE: This intentionally is identical to the format that influxdb itself
    // returns we make no attempt to transform or change the output.
    output: Joi.object().keys({
      results: Joi.object().allow(null),
      error: Joi.string().allow(null),
    }),
    input: Joi.object().keys({
      query: Joi.string().required(),
    }).required(),
  }, async (req, res) => {
    let {account} = req;
    let scopes = ctx.scopes.accountScopes(account);
    if (scopes.indexOf(METRICS_SCOPES) === -1) {
      log.warn(`Attempted to query metrics without proper scope ${account.email}`);
      res.sendStatus(401);
      return;
    }

    if (!ctx.influxdb) {
      const output: QueryMetricsOutput = {
        results: null,
        error: 'InfluxDB not configured',
      };
      res.respond(output);
      return;
    }

    let {query} = req.body;
    const queryResults = await ctx.influxdb.query(query);
    const output: QueryMetricsOutput = {
      results: queryResults.results || null,
      error: queryResults.error || null,
    };
    res.respond(output);
  });

  api.define({
    path: 'sas_signaling_devices',
    method: 'post',
    params: [],
    name: 'getSasForDeviceSignaling',
    description:
      `Return SAS credentials for querying avaiable devices -> singaling servers`,

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
      publicUrl: Joi.string(), // not requried
      sas: Joi.array().items(Joi.any()).required(),
    }),
  }, async (req, res) => {
    // 6 hours in the future ...
    const expiration = new Date(Date.now() + 1000 * 60 * 60 * 6);
    // Account ID is always the partition key... The client itself may not have
    // this data so we send it over ...
    const PartitionKey = req.account._id.toString();

    // Permissive sas which allows reading the entire table ...
    const sas = ctx.sasSigner.createTableSignatures(
      'sigdevices',
      {
        expiration,
        signedPermissions: 'r',
        startPartitionKey: PartitionKey,
        endPartitionKey: PartitionKey,
      }
    );

    const output: GetSasForDeviceSignalingOutput = {
      publicUrl: ctx.config.signaling.publicUrl,
      sas,
    };

    res.respond(output);
  });

  api.define({
    path: 'list_clients',
    method: 'post',
    params: [],
    name: 'listClients',
    description: 'List all registered clients',
    output: Joi.object().keys({
      clients: Joi.array().required().items(Joi.object().keys({
        publicKey: Accounts.PUBLIC_KEY_SCHEMA,
        userAgent: Joi.string().required(),
        scopes: Joi.array().items(Joi.string()).required(),
        issued: Joi.date().required(),
        expires: Joi.date().required(),
        lastSeenAt: Joi.date().required(),
      })),
    }),
    input: Joi.object().keys({
      // TODO: Pagination?
    }).required(),
  }, async (req, res) => {
    const account: AccountRecord = req.account;

    const clients = account.accountTokens.map((accountToken) => {
      const {publicKey, userAgent, scopes, issued, expires} = accountToken;
      return {
        publicKey,
        userAgent: userAgent || '',
        scopes: scopes || [],
        issued: issued.toString(),
        expires: expires.toString(),
        // TODO: Implement for real but this stub will let us move on for now.
        lastSeenAt: (new Date()).toString(),
      };
    });

    const output: ListClientsOutput = {clients};
    res.respond(output);
  });

  api.define({
    path: 'post_message',
    method: 'post',
    params: [],
    name: 'postMessage',
    description: 'Deliver a message to a device',
    output: Joi.object(),
    input: Joi.object().keys({
      devicePublicKey: Devices.PUBLIC_KEY_SCHEMA,
      message: Devices.ONION_SCHEMA.required(),
    }).required(),
  }, async (req, res) => {
    const accountId = req.account._id;
    const {devicePublicKey: publicKey, message} = req.body;

    const valid = await ctx.devices.belongsToAccount(accountId, publicKey);
    if (!valid) {
      log.warn(`Account '${accountId}' is attempting to send a message to ` +
               `device '${publicKey}' that it doesn't own`);
      res.sendStatus(403);
      return;
    }

    const result = await ctx.devices.addToMailbox({publicKey, message});
    if (result.error) {
      log.warn(`addToMailbox failed`, result, publicKey, message);
    }

    const output: PostMessageOutput = {};
    res.respond(output);
  });

  api.define({
    path: 'revoke_client',
    method: 'post',
    params: [],
    name: 'revokeClient',
    description: 'Revoke a client',
    output: Joi.object().keys({
      success: Joi.boolean().required(),
    }).required(),
    input: Joi.object().keys({
      clientPublicKey: Accounts.PUBLIC_KEY_SCHEMA,
      revokeClientMessageForDevices: Devices.ONION_SCHEMA.required(),
    }).required(),
  }, async (req, res) => {
    const accountId = req.account._id;
    const {
      clientPublicKey: publicKey,
      revokeClientMessageForDevices: message,
    } = req.body;

    const clientAccount = await ctx.accounts.findByPublicKey(publicKey);
    if (!clientAccount) {
      log.warn(`Account '${accountId}' is attempting to revoke an unknown ` +
               `client '${publicKey}'`);
      res.sendStatus(404);
      return;
    }

    if (!accountId.equals(clientAccount._id)) {
      log.warn(`Account '${accountId}' is attempting to revoke client ` +
               `'${publicKey}' that belongs to a different account ` +
               `'${clientAccount._id}'`);
      res.sendStatus(403);
      return;
    }

    const result = await ctx.accounts.revokeClient({accountId, publicKey});
    if (result.error) {
      log.warn(`revokeClient failed`, result, publicKey, message);
      const output: RevokeClientOutput = {success: false};
      res.respond(output);
      return;
    }

    const devices = await ctx.devices.findAllByAccount(accountId);
    for (const device of devices) {
      const devicePublicKey = device.accessToken.publicKey;
      const result = ctx.devices.addToMailbox({
        publicKey: devicePublicKey,
        message,
      });
      if (result.error) {
        log.warn(`addToMailbox failed`, result, devicePublicKey, message);
      }
    }

    const output: RevokeClientOutput = {success: true};
    res.respond(output);
  });

  api.define({
    path: 'set_client_user_agent',
    method: 'post',
    params: [],
    name: 'setClientUserAgent',
    description: 'Set the userAgent for a client',
    output: Joi.object().keys({
      success: Joi.boolean().required(),
    }).required(),
    input: Joi.object().keys({
      clientPublicKey: Accounts.PUBLIC_KEY_SCHEMA,
      userAgent: Accounts.USER_AGENT_SCHEMA,
    }).required(),
  }, async (req, res) => {
    const accountId = req.account._id;
    const {
      clientPublicKey: publicKey,
      userAgent,
    } = req.body;

    const clientAccount = await ctx.accounts.findByPublicKey(publicKey);
    if (!clientAccount) {
      log.warn(`Account '${accountId}' is attempting to change the userAgent ` +
               `of an unknown client '${publicKey}'`);
      res.sendStatus(404);
      return;
    }

    if (!accountId.equals(clientAccount._id)) {
      log.warn(`Account '${accountId}' is attempting to change the userAgent ` +
               `for client '${publicKey}' that belongs to a different ` +
               `account '${clientAccount._id}'`);
      res.sendStatus(403);
      return;
    }

    const result = await ctx.accounts.setUserAgent({
      accountId,
      publicKey,
      userAgent,
    });
    if (result.error) {
      log.warn(`setUserAgent failed`, result, publicKey, userAgent);
      const output: SetClientUserAgentOutput = {success: false};
      res.respond(output);
      return;
    }

    const output: SetClientUserAgentOutput = {success: true};
    res.respond(output);
  });

  return api;
}
