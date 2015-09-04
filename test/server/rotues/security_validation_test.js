/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import createContext from '../context';
import createApi from '../../../src/api';
import launchApp from '../launch_app';
import createIntercept from '../intercept';

import express from 'express';
import testRoutes from '../../../src/server/routes/security_validation';
import eventToPromise from 'event-to-promise';

import Accounts from '../../../src/server/models/accounts';
import SecurityAPI from '../../../src/api/gen/security_validation';

/**
 * Basic suite of security validation tests... These are intended to be a
 * collection of very high level tests against our http servers. Lower level
 * testing (such as on the API of jwt) should be done elsewhere.
 */
suite('security validation tests', () => {
  let context = createContext();

  // URL where the target server lives.
  let canonicalURL;

  // Setup the canonical server resources...
  let accounts, app;
  setup(async () => {
    accounts = new Accounts(context.db);
    app = express();
    app.use(require('../../../src/server/json'));
    app.use(testRoutes({
      accounts
    }).app);

    canonicalURL = await launchApp(app);
  });

  // Setup the user and api which the user will use to interact with the
  // server...
  let api, secApi, id;
  let userInput = {
    userAgent: 'woot',
    email: 'user@example.com',
    password: 'passwordsogood'
  };
  setup(async () => {
    // Setup public api...
    api = createApi({ serverUrl: context.url });
    id = api.id.create();
    api.vip.key = id;

    // Create our test user...
    let create = await api.vip.createAccountWithPassword(userInput);
    assert.ok(create.success);
  });

  // Setup security api and MITM.
  let intercept, interceptURL;
  setup(async () => {
    let mitm = await createIntercept();
    intercept = mitm.intercept;
    interceptURL = mitm.url;
    // Setup security testing api
    secApi = new SecurityAPI(interceptURL);
    secApi.key = id;
  });

  /**
   * Our JWT tokens may be used in non-ssl situations while we use the http
   * protocol below primarily we are verifying our implementation of how we
   * check the JWT tokens.
   */
  test('unmodified request replay attack...', async () => {
    // Initiate the request but do not wait for it to be completed...
    secApi.aPut();

    let req = await eventToPromise(intercept, 'request');
    let canonicalReply = await req.send(canonicalURL);

    // If the request has been sent to something we do not control (as intercept
    // mimics) then sends it back to us we are unable to prevent this (how is
    // the server supposed to know?)
    assert.equal(canonicalReply.res.status, 200);

    // Now attempt to replay the captured request.
    let canonicalReplayReply = await req.send(canonicalURL);

    // This should fail since the server has seen this particular request
    // before.
    assert.notEqual(canonicalReplayReply.res.status, 200);
  });

  /**
   * JWT is signed but http body is not (by default) this test verifies our
   * implementation of body signing will ensure the http body has not been
   * mutated.
   */
  test('unauthorized body mutations', async () => {
    secApi.aPut();
    let req = await eventToPromise(intercept, 'request');
    // Send a different body...
    req.body = JSON.stringify({ hacked: true });

    let canonicalReply = await req.send(canonicalURL);
    assert.equal(canonicalReply.res.status, 400);
  });

  test('send unmodified body/headers/path to different method', async () => {
    secApi.aPut();
    let req = await eventToPromise(intercept, 'request');
    // Send different method
    req.method = 'post';

    let canonicalReply = await req.send(canonicalURL);
    assert.equal(canonicalReply.res.status, 400);
  });

  test('send unmodified body/headers/method to different path', async () => {
    secApi.aPut();
    let req = await eventToPromise(intercept, 'request');
    // Send different path.
    req.path = '/v1/test/b';

    let canonicalReply = await req.send(canonicalURL);
    assert.equal(canonicalReply.res.status, 400);
  });

});


