// @noflow
import assert from 'assert';
import express from 'express';
import {json as jsonParser} from 'body-parser';
import URL from 'url';

import Client from '..';

function sleep(amount) {
  return new Promise((accept) => {
    setTimeout(accept, amount);
  });
}

suite('api call retries', () => {

  class TestClient extends Client {
    name: string = 'test-client';

    retryMe(body?: Object = {}): Promise<any> {
      return this.request(['/test', {
        method: 'post',
        body,
      }]);
    }
  }

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
        body,
      });
    }

    shift() {
      return this.list.shift();
    }
  }

  let testModel, app, server, serverUrl;
  setup(async () => {
    testModel = new TestModel();

    app = express();
    app.use(jsonParser());
    app.post('/test', async (req, res) => {
      /**
       * There are a number of important conditions which can fail under:
       *
       *  - 500 errors (internal server errors)
       *  - Takes too long to send a response (timeout getting initial response)
       *  - Takes too long getting the body (waiting for content length amount of
       *    bytes)
       */

      let command = testModel.shift();
      if (!command) {
        res.sendStatus(500);
        return;
      }

      let { status, delayBody, delayRes, body } = command;
      await sleep(delayRes);

      // We don't actually use out helpers with the outgoing body so we can more
      // strictly control the various error conditions.
      assert(Buffer.isBuffer(body));
      let contentLength = body.length;

      res.set('Content-Length', contentLength);
      res.set('Content-Type', 'application/json');
      res.writeHead(status, {
        'Content-Length': contentLength,
        'Content-Type': 'application/json',
      });
      await sleep(delayBody);
      res.end(body);
    });

    server = app.listen(0);
    serverUrl = `http://0.0.0.0:${server.address().port}/`;
  });

  function buildTestApi(options: Object): Client {
    let requestTransformer = async (req) => {
      let [url, options] = req;
      url = URL.resolve(serverUrl, url);

      if (typeof options.body !== 'string') {
        options.body = JSON.stringify(options.body);
      }

      options.headers = options.headers || {};
      options.headers['Content-Type'] = 'application/json';

      return [url, options];
    };

    return new TestClient(Object.assign({}, options, { requestTransformer }));
  }


  teardown(() => {
    server.close();
  });

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
    const res = await api.retryMe();
    const body = await res.json();
    assert.equal(body.woot, true);
  });


  test('works after 500ms', async () => {
    let api = buildTestApi();

    setTimeout(() => {
      testModel.push(200, 0, 0, { woot: true });
    }, 500);

    const res = await api.retryMe();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.woot, true);
  });

  test('errors with no retries', async () => {
    let api = buildTestApi();
    // 400~ range status code should not be retried...
    for (let code = 400; code < 417; code++) {
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
      requestTimeout: 10,
    });

    testModel.push(200, 5000, 0);
    testModel.push(200, 5000, 0);
    testModel.push(200, 5000, 0);
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
      maxRetries: 1,
      // Zero delay ...
      retryDelayMinMs: 0,
      retryDelayMaxMs: 0,
      // Very short retry timeout...
      requestTimeout: 10,
    });

    testModel.push(200, 0, 50000);
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
