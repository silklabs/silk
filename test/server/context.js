/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

import crypto from 'crypto';
import loadConfig from '../../src/server/config';
import createServer from '../../src/server/server';
import createDb from '../../src/server/db';
import request from 'superagent-promise';
import merge from 'lodash.merge';
import pbkdf2 from 'pbkdf2';

let api = require('../../src/api')();

export function passwordHash(context, text) {
  // The assumption here is this will be much stronger when sent from the
  // client!
  return pbkdf2.pbkdf2Sync(text, 'salt', 1, 32, 'sha256').toString('hex');
}

export function sha256(context, text) {
  var sha1 = crypto.createHash('sha256');
  sha1.update(text);
  return sha1.digest('hex');
}

export async function get(context, path) {
  let req = request.get(`${context.url}${path}`);
  return await req.end().catch(err => {
    return err.response;
  });
}

export async function post(context, path, json) {
  let req = request.post(`${context.url}${path}`).send(json);
  return await req.end().catch(err => {
    return err.response;
  });
}

export async function createAccount(context, email, name, passphrase) {
  let id = api.id.create();
  let passwordHash = sha256(context, passphrase);

  let result = await post(context, '/account/create', {
    id: id.toString(),
    email: email,
    name: name,
    passwordHash: passwordHash,
    sig: id.sign(passwordHash)
  });

  if (201 !== result.statusCode) {
    throw new Error('Could not create account ' + email);
  }
  return id;
}

export async function createAccountAndAuth(context) {
  let id = await createAccount(
    context, 'test@example.org', 'Test', 'passphrase'
  );

  let challenge = await post(
    context, '/account/challenge', { id: id.toString() }
  );

  if (200 !== challenge.statusCode) {
    throw new Error('Could not challenge fake account');
  }

  let receipt = challenge.body.receipt;
  let sig = id.sign(sha256(context, 'passphrase') + ' ' + receipt);

  let auth = await post(context, '/account/authenticate', {
    id: id.toString(),
    receipt,
    sig
  });

  if (200 !== auth.statusCode) {
    throw new Error('Could not authenticate fake account');
  }

  return auth.body.session;
}

export async function createDevice(context) {
  let id = api.id.create();
  let session = await createAccountAndAuth(context);
  let register = await post(context, '/account/device/register', {
    session: session,
    name: 'Test device',
    deviceId: id.toString(),
    sig: id.sign(id.toString())
  });

  if (201 !== register.statusCode) {
    throw new Error('Could not create device');
  }
  return id;
}

/**
Main sets up and configures the test context...
*/
export default function createContext(overrides = {}) {
  let context = {};

  setup(async () => {
    let config = merge({}, loadConfig('test'), overrides);
    let server = await createServer(config);

    context.db = await createDb(config);
    context.config = config;
    context.server = server;
    context.url = `http://localhost:${server.port}`;

    // assign methods for convenience...
    for (let name in module.exports) {
      let method = module.exports[name];
      if (typeof method === 'function' && method !== createContext) {
        context[name] = (...args) => { // eslint-disable-line no-loop-func
          return method.apply(null, [context].concat(args));
        };
      }
    }
  });

  teardown(async () => {
    await context.db.dropDatabase();
    await context.db.close();
    await context.server.close();
  });

  return context;
}
