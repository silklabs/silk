/**
 * Test only routes to checking some of our security features,
 */
import { Router } from 'express';
import { expressApi } from 'api-schema';
import * as Joi from 'joi';
import jwtMiddleware from '../jwt';

const PREFIX = '/v1/test/';

export default function (ctx) {
  let routes = new Router();

  let api = expressApi(routes, {
    name: 'auth',
    prefix: PREFIX,
    description: `
      Test routes for validating security features.
    `,
  });

  routes.use(PREFIX, jwtMiddleware(async (req) => {
    // All interactions require an account...
    // XXX: Factor this into it's own module.
    let id = req.unsafeJwt.header.id;

    // Attempt to find an account with this id...
    let account = await ctx.accounts.findByPublicKey({
      publicKey: id
    });

    if (!account) {
      return null;
    }

    let accessToken = account.accountTokens.find(v => {
      return v.publicKey === id;
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




  return api;
}

