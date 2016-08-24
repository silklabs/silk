/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import Joi from 'joi';

const MODE_SCHEMA =
  Joi.string().only([`off`, `on`, `beacon`]);
const KEY_SCHEMA = Joi.string().hex().length(64);
const UINT16_SCHEMA = Joi.number().integer().min(0).max(65535);
const BEACON_POWER_SCHEMA = Joi.number().integer().min(-100).max(0);
const ADVERTISING_INFO_SCHEMA = Joi.object({
  uuid: Joi.string().guid().required(),
  id: UINT16_SCHEMA.required(),
});
const ERROR_SCHEMA = {
  message: Joi.string().required(),
  stack: Joi.string().required(),
};
const ERROR_PROPERTY_SCHEMA = Joi.object(ERROR_SCHEMA);
const PUBLIC_KEYS_SCHEMA = Joi.array().items(KEY_SCHEMA).unique();
const PROMISE_ID = Joi.number().integer().min(0);

function messageSchema(name: string, ...args: Array<any>): Object {
  return Joi.object(
    Object.assign({
      name: Joi.string().only(name).required(),
    }, ...args)
  ).unknown(false).required();
}

function promiseSchema(name: string, ...args: Array<any>): Object {
  return Joi.object(
    Object.assign({
      name: Joi.string().only(name).required(),
      promiseId: PROMISE_ID.required(),
    }, ...args)
  ).unknown(false).required();
}

const MESSAGES_FROM_BOTH = {
  socket: messageSchema(`socket`),
};

const MESSAGES_FROM_CHILD = Object.assign({}, MESSAGES_FROM_BOTH, {
  error: messageSchema(`error`, {
    message: Joi.string().required(),
  }),

  initialized: messageSchema(`initialized`),

  mode: promiseSchema(`mode`, {
    mode: MODE_SCHEMA.required(),
    error: ERROR_PROPERTY_SCHEMA.optional(),
  }),
});

const MESSAGES_FROM_PARENT = Object.assign({}, MESSAGES_FROM_BOTH, {
  initialize: messageSchema(`initialize`, {
    privateKey: KEY_SCHEMA.required(),
    serverPath: Joi.string().required(),
    mode: MODE_SCHEMA.required(),
    publicKeys: PUBLIC_KEYS_SCHEMA.required(),
    manufacturerCode: UINT16_SCHEMA.required(),
    deviceType: UINT16_SCHEMA.required(),
    beaconPower: BEACON_POWER_SCHEMA.required(),
    advertisingInfo: ADVERTISING_INFO_SCHEMA.optional(),
  }),

  publicKeys: messageSchema(`publicKeys`, {
    publicKeys: PUBLIC_KEYS_SCHEMA.required(),
  }),

  advertisingInfo: messageSchema(`advertisingInfo`, {
    advertisingInfo: ADVERTISING_INFO_SCHEMA.required(),
  }),

  mode: promiseSchema(`mode`, {
    mode: MODE_SCHEMA.required(),
  }),
});

// Avoids needing to pass in an argument...
const incomingMessages =
  (`send` in process) ? MESSAGES_FROM_PARENT : MESSAGES_FROM_CHILD;
const outgoingMessages =
  (`send` in process) ? MESSAGES_FROM_CHILD : MESSAGES_FROM_PARENT;

const validIncomingMessage =
  Joi.object({
    name: Joi.string().only(Object.keys(incomingMessages)).required(),
  }).unknown(true).required();

const validOutgoingMessage =
  Joi.object({
    name: Joi.string().only(Object.keys(outgoingMessages)).required(),
  }).unknown(true).required();

const validateMessage = {
  in: function(message: Object): void {
    Joi.assert(message, validIncomingMessage);
    Joi.assert(message, incomingMessages[message.name]);
  },

  out: function(message: Object): void {
    Joi.assert(message, validOutgoingMessage);
    Joi.assert(message, outgoingMessages[message.name]);
  },
};

export default validateMessage;
