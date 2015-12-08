/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import createContext from '../server/context';
import launchApp from '../server/launch_app';
import express from 'express';
import testRoutes from '../../src/server/routes/test';
import {StateContainer} from '../../src/api/http_client';
import TestAPI from '../../src/api/gen/test';

suite('api call retries', () => {
  let context = createContext();

  /**
   * Small model to manage internal state so we can simulate all the various
   * types of retry conditions...
   */
  class TestModel {
    list = [];

    push(status = 200, delayRes = 0, delayBody = 0, body = {}) {
      body = new Buffer(JSON.stringify(body));
      this.list.push({
        status,
        delayRes,
        delayBody,
        body
      });
    }

    shift() {
      return this.list.shift();
    }
  }

  // Setup the canonical server resources...
  let account, app, testServerURL, testModel;
  setup(async () => {
    app = express();
    app.use(require('../../src/server/json'));
    testModel = new TestModel();

    // XXX: A little yucky but copies the proper context from the real server
    // copy.
    let appContext = Object.assign(
      {},
      context.server.context,
      {
        test: testModel
      }
    );
    app.use(testRoutes(appContext).app);

    testServerURL = await launchApp(app);
    account = await context.testAccount();
  });

  function buildTestApi(options = {}) {
    return new TestAPI(new StateContainer({
      serverUrl: testServerURL,
      accessToken: account.accessToken,
    }), options);
  }

  test('immediate success', async () => {
    let api = buildTestApi();
    testModel.push(200, 0);
    let res = await api.retryMe();
    assert.ok(res);
  });

  test('works on third try', async () => {
    let api = buildTestApi();
    testModel.push(500, 0);
    testModel.push(500, 0);
    testModel.push(200, 0, 0, { woot: true });
    let res = await api.retryMe();
    assert.equal(res.woot, true);
  });


  test('works after 500ms', async () => {
    let api = buildTestApi();

    setTimeout(() => {
      testModel.push(200, 0, 0, { woot: true });
    }, 500);

    let res = await api.retryMe();
    assert.equal(res.woot, true);
  });

  test('errors with no retries', async () => {
    let api = buildTestApi();
    // 400~ range status code should not be retried...
    for (var code = 400; code < 417; code++) {
      testModel.push(code);
      try {
        await api.retryMe();
      } catch (err) {
        continue;
      }
      throw new Error(`Should throw an error on ${code}`);
    }
  });

  test('timeout during request', async () => {
    let api = buildTestApi({
      // Shorter tests...
      maxRetries: 3,
      // Zero delay ...
      retryDelayMinMs: 0,
      retryDelayMaxMs: 0,
      // Very short retry timeout...
      requestTimeout: 10
    });

    testModel.push(200, 5000, 0);
    try {
      await api.retryMe();
    } catch (err) {
      assert.ok(err.message.indexOf('Timeout') !== -1);
      return;
    }

    throw new Error('Should have thrown a timeout error...');
  });

  test('timeout during response body', async () => {
    let api = buildTestApi({
      // Shorter tests...
      maxRetries: 3,
      // Zero delay ...
      retryDelayMinMs: 0,
      retryDelayMaxMs: 0,
      // Very short retry timeout...
      requestTimeout: 10
    });

    testModel.push(200, 0, 50000);
    try {
      await api.retryMe();
    } catch (err) {
      assert.ok(err.message.indexOf('Timeout') !== -1);
      return;
    }

    throw new Error('Should have thrown a timeout error...');
  });

});
