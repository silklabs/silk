
import assert from 'assert';
import createContext from '../context';
import createApi from 'silk-api';
import launchApp from '../launch_app';
import createIntercept from '../intercept';
import timekeeper from 'timekeeper';
import express from 'express';
import testRoutes from '../../../src/server/routes/test';
import eventToPromise from 'event-to-promise';
import mutateJWT from '../mutate_jwt';
import uuid from 'uuid';

import Accounts from '../../../src/server/models/accounts';
import Nonce from '../../../src/server/models/nonce';
import TestAPI from 'silk-api/src/gen/test';
import {StateContainer} from 'silk-api/src/http_client';

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
  let accounts, app, nonce;
  setup(async () => {
    nonce = new Nonce(context.db);
    accounts = new Accounts(context.db);
    app = express();
    app.use(require('../../../src/server/json'));
    app.use(testRoutes({
      accounts,
      nonce
    }).app);

    canonicalURL = await launchApp(app);
  });

  // Setup the user and api which the user will use to interact with the
  // server...
  let api, testApi;

  let users = {
    one: {
      id: null, // will be assigned later
      input: {
        userAgent: 'woot',
        email: `${uuid.v4()}@example.com`,
        password: 'passwordsogood'
      }
    },

    two: {
      id: null, // will be assigned later
      input: {
        userAgent: 'woot',
        email: `${uuid.v4()}@example.com`,
        password: 'passwordsogood'
      }
    }
  };

  setup(async () => {
    // Setup public api...
    api = createApi({ serverUrl: context.url });

    for (var userKey in users) {
      let user = users[userKey];
      user.id = api.id.create();
      api.accessToken = user.id;

      // Create test users...
      let create = await api.vip.createAccountWithPassword(user.input);
      assert.ok(create.success);
    }
  });

  // Setup security api and MITM.
  let intercept, interceptURL;
  setup(async () => {
    let mitm = await createIntercept();
    intercept = mitm.intercept;
    interceptURL = mitm.url;
    // Setup security testing api
    testApi = new TestAPI(new StateContainer({
      serverUrl: interceptURL,
      accessToken: users.one.id,
    }));
  });

  teardown(() => {
    // Ensure timekeeper is reset so not to break other things.
    timekeeper.reset();
  });

  /**
   * Our JWT tokens may be used in non-ssl situations while we use the http
   * protocol below primarily we are verifying our implementation of how we
   * check the JWT tokens.
   */
  test('unmodified request replay attack...', async () => {
    // Initiate the request but do not wait for it to be completed...
    testApi.aPut();

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

    // Purge all nonce(s) to simulate expired nonce values...
    let del = await nonce.collection.remove({});
    assert.ok(del.ok, 'deleted all nonce');

    // Move internal time into the future to simulate a replay attack after the
    // token has expired.
    let future = new Date(Date.now() + 60 * 1000 * 2);
    timekeeper.freeze(future);

    // Now attempt to replay the captured request.
    let canonicalReplayReplyExpired = await req.send(canonicalURL);

    // Even though the server no longer remembers the token it should still fail
    // because the token is now expired.
    assert.notEqual(canonicalReplayReplyExpired.res.status, 200);
  });

  /**
   * JWT is signed but http body is not (by default) this test verifies our
   * implementation of body signing will ensure the http body has not been
   * mutated.
   */
  test('unauthorized body mutations', async () => {
    testApi.aPut();
    let req = await eventToPromise(intercept, 'request');
    // Send a different body...
    req.body = JSON.stringify({ hacked: true });
    req.headers['content-length'] = Buffer.byteLength(req.body);

    let canonicalReply = await req.send(canonicalURL);
    assert.equal(canonicalReply.res.status, 400);
  });

  test('send unmodified body/headers/path to different method', async () => {
    testApi.aPut();
    let req = await eventToPromise(intercept, 'request');
    // Send different method
    req.method = 'post';

    let canonicalReply = await req.send(canonicalURL);
    assert.equal(canonicalReply.res.status, 400);
  });

  test('send unmodified body/headers/method to different path', async () => {
    testApi.aPut();
    let req = await eventToPromise(intercept, 'request');
    // Send different path.
    req.path = '/v1/test/b';

    let canonicalReply = await req.send(canonicalURL);
    assert.equal(canonicalReply.res.status, 400);
  });

  /**
   * The request will be validly signed but attempting to use another users id.
   */
  test('use a valid public key belonging to someone else', async () => {
    testApi.aPut();
    let req = await eventToPromise(intercept, 'request');
    let auth = req.headers.authorization;
    let originalJWT = auth.split('Bearer ').pop();

    let modifiedJWT = mutateJWT(originalJWT, (headers, body, sig) => {
      // Sanity check ensure we are using the expected initial user so we set it
      // to a different one...
      assert.equal(users.one.id.pub, headers.id);
      // Change id to another valid user...
      headers.id = users.two.id.pub;
      return { headers, body, sig };
    });

    req.headers.authorization = `Bearer ${modifiedJWT}`;

    let canonicalReply = await req.send(canonicalURL);
    assert.equal(canonicalReply.res.status, 403);
  });

  /**
   * Simple "attack" null out a vital field (id)
   */
  test('null jwt.headers.id', async () => {
    testApi.aPut();
    let req = await eventToPromise(intercept, 'request');
    let auth = req.headers.authorization;
    let originalJWT = auth.split('Bearer ').pop();

    let modifiedJWT = mutateJWT(originalJWT, (headers, body, sig) => {
      delete headers.id;
      return { headers, body, sig };
    });

    req.headers.authorization = `Bearer ${modifiedJWT}`;

    let canonicalReply = await req.send(canonicalURL);
    assert.ok(canonicalReply.res.status >= 400);
  });

  /**
   * Simple "attack" null out a vital field (sig)
   */
  test('null jwt.headers.sig', async () => {
    testApi.aPut();
    let req = await eventToPromise(intercept, 'request');
    let auth = req.headers.authorization;
    let originalJWT = auth.split('Bearer ').pop();

    let modifiedJWT = mutateJWT(originalJWT, (headers, body, sig) => {
      sig = '';
      return { headers, body, sig };
    });

    req.headers.authorization = `Bearer ${modifiedJWT}`;

    let canonicalReply = await req.send(canonicalURL);
    assert.ok(canonicalReply.res.status >= 400);
  });

  /**
   * Wrong JWT algo (none)
   */
  test('jwt.headers.algo == none', async () => {
    testApi.aPut();
    let req = await eventToPromise(intercept, 'request');
    let auth = req.headers.authorization;
    let originalJWT = auth.split('Bearer ').pop();

    let modifiedJWT = mutateJWT(originalJWT, (headers, body, sig) => {
      headers.algo = 'none';
      return { headers, body, sig };
    });

    req.headers.authorization = `Bearer ${modifiedJWT}`;

    let canonicalReply = await req.send(canonicalURL);
    assert.ok(canonicalReply.res.status >= 400);
  });

  /**
   * Wrong JWT algo (foobar)
   */
  test('jwt.headers.algo == foobar', async () => {
    testApi.aPut();
    let req = await eventToPromise(intercept, 'request');
    let auth = req.headers.authorization;
    let originalJWT = auth.split('Bearer ').pop();

    let modifiedJWT = mutateJWT(originalJWT, (headers, body, sig) => {
      headers.algo = 'foobar';
      return { headers, body, sig };
    });

    req.headers.authorization = `Bearer ${modifiedJWT}`;

    let canonicalReply = await req.send(canonicalURL);
    assert.ok(canonicalReply.res.status >= 400);
  });

});
