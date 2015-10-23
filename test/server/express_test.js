import createApi from '../../src/server/express';
import eventToPromise from 'event-to-promise';
import fetch from 'node-fetch';
import assert from 'assert';
import * as Joi from 'joi';
import gen from '../../src/gen';
import fs from 'mz/fs';

suite('express', () => {

  let app, url;
  setup(async () => {
    app = require('express')();
    app.use(require('body-parser').json());

    let http = app.listen(0);
    await eventToPromise(http, 'listening');
    url = `http://localhost:${http.address().port}`;
  });

  suite('prefixed params', () => {
    let subject;
    let clientPath = `${__dirname}/api_global_params_client.js`;

    async function clear() {
      if (await fs.exists(clientPath)) {
        await fs.unlink(clientPath);
      }
    }

    setup(clear);
    teardown(clear);

    let client;
    setup(async () => {
      subject = createApi(app, {
        prefix: '/woot/:id/',
        description: 'Prefixed route',
        params: [
          {
            name: 'id',
            description: 'id'
          }
        ]
      });

      subject.define(
        {
          name: 'bar',
          path: 'bar',
        },
        async (req, res) => {
          assert.equal(req.params.id, 'idparam');
          res.respond({
            yay: true
          });
        }
      );

      let generated = gen(subject.api.toJSON(), {
        baseClassPath: `${__dirname}/client`
      });
      await fs.writeFile(clientPath, generated);
      let Client = require(clientPath);
      client = new Client(url);
    });

    test('using api global params', async () => {
      let response = await client.bar('idparam');
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { yay: true });
    });
  });

  suite('define and client usage', () => {
    let clientPath = `${__dirname}/api_client.js`;

    async function clear() {
      if (await fs.exists(clientPath)) {
        await fs.unlink(clientPath);
      }
    }

    setup(clear);
    teardown(clear);

    let client, subject;
    setup(async () => {
      subject = createApi(app, {
        name: 'test',
        description: 'Testing app'
      });

      subject.define(
        {
          name: 'doFoo',
          description: `
            Perform some special action AKA: "Foo"
            Yup
          `,
          method: 'post',
          input: Joi.object().keys({
            token: Joi.any().description('search token').required()
          }),
          output: Joi.object().keys({
            token: Joi.string().description('search token').required(),
            name: Joi.string().description('name of item').required(),
            id: Joi.number().description('id of item').required(),
          }),
          path: '/foo/:id/:name',
          params: [
            {
              name: 'Product ID',
              description: 'specific id of product'
            },
            {
              name: 'Desired name',
              description: 'user specified name'
            }
          ]
        },
        async (req, res) => {
          res.respond({
            token: req.body.token,
            name: 'name',
            id: 1
          });
        }
      );

      // Bare minimum values
      subject.define(
        {
          name: 'noParams',
          path: 'nope',
        },
        async (req, res) => {
          res.respond({
            yay: true
          });
        }
      );


      let generated = gen(subject.api.toJSON(), {
        baseClassPath: `${__dirname}/client`
      });
      await fs.writeFile(clientPath, generated);
      let Client = require(clientPath);
      client = new Client(url);
    });

    test('.name', () => {
      assert.equal(client.name, 'test');
    });

    test('server response', async () => {
      let token = 'wootbar';
      let res = await fetch(`${url}/foo/1/bar`, {
        method: 'post',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token,
        })
      });
      assert.equal(res.status, 200);
      let json = await res.json();
      assert.deepEqual(json, {
        token,
        id: 1,
        name: 'name'
      });
    });

    test('client usage', async () => {
      let token = 'xfoo';
      let response = await client.doFoo(1, 'name', {
        token
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.token, token);
    });

    test('client with default params', async () => {
      let response = await client.noParams();
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { yay: true });
    });

    test('invalid requests', async () => {
      let token = 'xfoo';
      let response = await client.doFoo('foot', 1, {});
      assert.equal(response.status, 400);
      assert.equal(response.body.code, 400);
      assert.equal(response.body.type, 'InputError');
      assert.ok(response.body.message, 'has error message');
    });

    test('invalid output', async () => {
      let response = await client.doFoo('foot', 1, {
        token: []
      });
      assert.equal(response.status, 500);
      assert.equal(response.body.code, 500);
    });
  });

});
