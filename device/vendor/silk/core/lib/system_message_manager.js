/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import invariant from 'assert';
import * as Joi from 'joi';
import {AccessToken} from 'silk-api';
import createLog from 'silk-log/device';
import * as onion from 'silk-onion';
import {PUBLIC_KEY_SCHEMA} from 'silk-server/src/server/models/base';

import {SYSTEM_CHANNEL_NAME} from './connections';
import {shutdown} from './main';

import type Connections from './connections';
import type {PermissionManagerConnection} from './permissions';

const log = createLog(`system-message-manager`);

const BASE64_REGEX =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

let accessToken: ?AccessToken = null;
let permissions: ?PermissionManagerConnection = null;

function makeBaseSchemaTemplate() {
  return {
    name: Joi.string().required(),
  };
}

function makeSystemMessageSchema(name: string, ...args: Array<any>): Object {
  const schema = Object.assign(makeBaseSchemaTemplate(), {
    name: Joi.string().only(name).required(),
  }, ...args);
  return Joi.object().keys(schema).unknown(false).required();
}

const WRAPPED_SYSTEM_MESSAGE_SCHEMA =
  Joi.object().keys({
    message: Joi.string().regex(BASE64_REGEX, 'base64'),
  }).unknown(false).required();

const VALID_SYSTEM_MESSAGE_SCHEMA =
  Joi.object().keys(makeBaseSchemaTemplate()).unknown(true).required();

const SYSTEM_MESSAGE_SCHEMAS = {
  reset: makeSystemMessageSchema(`reset`),
  'revoke-client': makeSystemMessageSchema(`revoke-client`, {
    clientId: PUBLIC_KEY_SCHEMA,
  }),
};

async function verifySystemMessage(base64Message: mixed): Promise<Object> {
  invariant(base64Message);
  invariant(accessToken);
  invariant(permissions);

  Joi.assert(base64Message, WRAPPED_SYSTEM_MESSAGE_SCHEMA);
  invariant(typeof base64Message === 'object');
  invariant(typeof base64Message.message === 'string');

  const input = new Buffer(base64Message.message, `base64`);

  const {channel, senderIdentity, payload: message} =
    await onion.genDecodeAndVerifyForUnknownSender({
      input,
      allowedChannels: [`http`, `rtc`],
      recipientIdentity: accessToken,
    });

  const sender = senderIdentity.pub;

  log.debug(`Decoded message`, {channel, sender, message});

  invariant(channel === `http` ||
            permissions.test(sender, `rtc`),
            `Sender '${sender}' does not have permission to send messages ` +
            `over the rtc channel`);

  Joi.assert(message, VALID_SYSTEM_MESSAGE_SCHEMA);

  invariant(message.name in SYSTEM_MESSAGE_SCHEMAS,
            `Unknown message name '${message.name}'`);

  Joi.assert(message, SYSTEM_MESSAGE_SCHEMAS[message.name]);

  switch (message.name) {
  case `reset`: {
    invariant(sender === accessToken.pub ||
              permissions.test(sender, `reset`),
              `Sender '${sender}' does not have permission to force a ` +
              `factory reset`);
    break;
  }

  case `revoke-client`: {
    invariant(permissions.test(sender, `revoke`),
              `Sender '${sender}' does not have permission to revoke other ` +
              `clients`);
    break;
  }

  default:
    throw new Error(`Untested message '${message.name}'`);
  }

  return {channel, sender, message};
}

async function systemMessageHandler(base64Message: mixed): Promise<void> {
  invariant(base64Message);
  invariant(accessToken);
  invariant(permissions);

  let channel, sender, message;
  try {
    ({channel, sender, message} = await verifySystemMessage(base64Message));
  } catch (error) {
    log.warn(`Failed to verify system message`, error);
    return;
  }

  invariant(channel);
  invariant(sender);
  invariant(message);

  log.info(`Received system message`, message);

  switch (message.name) {
  case `reset`: {
    await shutdown(`factoryreset`);
    break;
  }

  case `revoke-client`: {
    permissions.clear(sender);
    break;
  }

  default:
    throw new Error(`Should be unreachable`);
  }
}

export default function start(
  token: AccessToken,
  connections: Connections,
  permissionsConnection: PermissionManagerConnection,
): void {
  invariant(token);
  invariant(connections);
  invariant(permissionsConnection);

  invariant(!accessToken);
  accessToken = token;
  permissions = permissionsConnection;

  const channel = connections.getChannel(SYSTEM_CHANNEL_NAME);
  channel.on(SYSTEM_CHANNEL_NAME, systemMessageHandler);
}
