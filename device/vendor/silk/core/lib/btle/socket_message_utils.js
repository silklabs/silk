/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import Joi from 'joi';

const PROPERTY_NAME = `_[@*@]_`;

function controlSchema(): Object {
  const schema = {
    name: Joi.string().required(),
    [PROPERTY_NAME]: Joi.boolean().only(true).required(),
  };
  return schema;
}

function messageSchema(name: string, ...args: Array<any>): Object {
  const schema = Object.assign(controlSchema(), {
    name: Joi.string().only(name).required(),
  }, ...args);
  return Joi.object(schema).unknown(false).required();
}

const MESSAGES_FROM_CHILD = {
  error: messageSchema(`error`, {
    message: Joi.string().required(),
    stack: Joi.string().required(),
  }),

  authenticated: messageSchema(`authenticated`, {
    authenticated: Joi.boolean().required(),
  }),

  flatline: messageSchema(`flatline`),

  rssi: messageSchema(`rssi`, {
    value: Joi.number().integer().min(-100).max(0).required(),
  }),
};

const MESSAGES_FROM_PARENT = {
  allowUnauthenticated: messageSchema(`allowUnauthenticated`, {
    allow: Joi.boolean().required(),
  }),

  rssi: messageSchema(`rssi`, {
    enabled: Joi.boolean().required(),
  }),
};

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

const validMessage =
  Joi.object(controlSchema()).unknown(true).required();

export const validateMessage = {
  in: function(message: Object) {
    Joi.assert(message, validIncomingMessage);
    Joi.assert(message, incomingMessages[message.name]);
  },

  out: function(message: Object) {
    Joi.assert(message, validOutgoingMessage);
    Joi.assert(message, outgoingMessages[message.name]);
  },
};

export function isMessage(message: Object): boolean {
  const result = Joi.validate(message, validMessage);
  return !result.error;
}

export function createMessage(message: Object): Object {
  message = Object.assign({}, message);
  message[PROPERTY_NAME] = true;
  return message;
}
