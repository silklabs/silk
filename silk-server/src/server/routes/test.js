/**
 * Test only routes useful for various types of tests.
 */
import assert from 'assert';
import { Router } from 'express';
import { expressApi } from 'api-schema';
import * as Joi from 'joi';
import jwtMiddleware from '../jwt';

const PREFIX = '/v1/test/';

function sleep(amount) {
  return new Promise((accept) => {
    setTimeout(accept, amount);
  });
}

export default function (ctx) {
  let routes = new Router();

  let api = expressApi(routes, {
    name: 'test',
    prefix: PREFIX,
    description: `
      Test routes for validating security features.
    `,
  });

  routes.use(PREFIX, jwtMiddleware(ctx.nonce, async (publicKey) => {
    // Attempt to find an account with this id...
    let account = await ctx.accounts.findByPublicKey({
      publicKey: publicKey
    });

    if (!account) {
      return null;
    }

    let accessToken = account.accountTokens.find(v => {
      return v.publicKey === publicKey;
    });

    if (accessToken) {
      return accessToken.publicKey;
    }
    return null;
  }));

  /**
   * Note the names in both the paths and names of these routes are meaningless
   * the only significance they provide is uniqueness for things related to
   * forging or replay attacks.
   */

  api.define({
    path: 'a',
    method: 'post',
    params: [],
    name: 'aPost',
    input: Joi.object().required()
  }, async (req, res) => {
    res.respond({});
  });

  api.define({
    path: 'a',
    method: 'put',
    params: [],
    name: 'aPut',
    input: Joi.object().required()
  }, async (req, res) => {
    res.respond({});
  });

  api.define({
    path: 'b',
    method: 'put',
    params: [],
    name: 'bPut',
    input: Joi.object().required()
  }, async (req, res) => {
    res.respond({});
  });

  api.define({
    path: 'test',
    method: 'post',
    name: 'retryMe',
    input: Joi.object().required()
  }, async (req, res) => {
    /**
     * There are a number of important conditions which can fail under:
     *
     *  - 500 errors (internal server errors)
     *  - Takes too long to send a response (timeout getting initial response)
     *  - Takes too long getting the body (waiting for content length amount of
     *    bytes)
     */

    let command = ctx.test.shift();
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
      'Content-Type': 'application/json'
    });
    await sleep(delayBody);
    res.end(body);
  });

  return api;
}

