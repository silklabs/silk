
import crypto from 'crypto';
import loadConfig from '../../src/server/config';
import createServer from '../../src/server/server';
import createSocketioServer from '../../src/socketio/server';
import createDb from '../../src/server/db';
import createApi from '../../src/api';
import request from 'superagent-promise';
import merge from 'lodash.merge';
import pbkdf2 from 'pbkdf2';
import uuid from 'uuid';

import Id from '../../src/api/id';
import Accounts from '../../src/server/models/accounts';
import Devices from '../../src/server/models/devices';

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

export async function httpErrCode(context, code, fn) {
  try {
    await fn();
  } catch (err) {
    if (err.code !== code) {
      throw err;
    }
    return;
  }
  throw new Error('Expected an http error to be thrown...');
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

export async function assertThrows(context, asyncFn, testRegex) {
  try {
    await asyncFn();
  } catch (err) {
    if (!testRegex) {
      return;
    }

    if (testRegex.test(err.message)) {
      return;
    } else {
      throw new Error(`Unexpected error ${err.stack}`);
    }
  }
  throw new Error('Expected an error');
}

let testAccountId = 0;
// Allow tests to be run in parallel...
let uniqueId = uuid.v4();

export async function testAccount(context, overrides = {}) {
  let id = Id.create();
  let account = new Accounts(context.db);
  let email = `test.${uniqueId}.${String(testAccountId++)}@example.com`;
  let res = await account.create(Object.assign({}, {
    publicKey: id.toString(),
    email: email,
    passwordHash: context.passwordHash('password'),
    userAgent: 'nodejs'
  }, overrides));

  if (res.error) {
    throw new Error(`Failed to create test account: ${res.error.type}`);
  }

  let record = await account.findByPublicKey({
    publicKey: id.toString()
  });

  let api = createApi({ serverUrl: context.url });
  // Fail fast...
  api.maxRetries = 0;
  api.accessToken = id;

  return {
    api,
    accessToken: id,
    record,
    password: 'password'
  };
}

export async function testDevice(context) {
  let account = await testAccount(context);
  return await registeredDevice(context, account.accessToken);
}

export async function testPair(context) {
  let account = await testAccount(context);
  let device = await registeredDevice(context, account.accessToken);
  return { device, account };
}

export async function registeredDevice(ctx, accountAccessToken) {
  let api = createApi({ serverUrl: ctx.url });
  let devices = new Devices(ctx.db);
  let deviceAccessToken = api.id.create();

  api.accessToken = accountAccessToken;

  let token = accountAccessToken.sign(deviceAccessToken.toString());
  await api.account.registerDevice({
    devicePublicKey: deviceAccessToken.toString(),
    name: 'testing',
    type: 'camera',
    registrationToken: token
  });

  let device = await devices.findByPublicKey({
    publicKey: deviceAccessToken.toString()
  });

  // Act as the device rather then the account...
  api.accessToken = deviceAccessToken;
  // Fail fast...
  api.maxRetries = 0;
  await api.device.completeRegistration({
    registrarPublicKey: accountAccessToken.toString(),
    registrationToken: token
  });

  return {
    api,
    accessToken: deviceAccessToken,
    record: device
  };
}

/**
Main sets up and configures the test context...
*/
export default function createContext(overrides = {}) {
  let context = {};

  setup(async () => {
    let config = merge({}, loadConfig('test'), overrides);

    // socket.io server launches first so we can grab the url..
    let socketioServer = await createSocketioServer(config);
    config.socketio.port = socketioServer.port;
    config.socketio.publicUrl = `http://localhost:${socketioServer.port}`;

    let server = await createServer(config);

    context.db = await createDb(config);
    context.config = config;
    context.server = server;
    context.blobHandler = server.context.blobHandler;
    context.socketio = socketioServer;
    context.url = `http://localhost:${server.port}`;
    context.api = createApi({ serverUrl: context.url });

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
    await context.socketio.close();
  });

  return context;
}
