/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import api from '../../src/api';
import * as util from './util';

suite('device register', () => {
  async function registerDevice(session, id) {
    return await util.post('/account/device/register', {
      session: session,
      name: 'Device Name',
      deviceId: id.toString(),
      sig: id.sign(id.toString())
    });
  }

  let context, id, idTwo, session;
  setup(async () => {
    context = await util.setup();
    id = await api.id.create();
    idTwo = await api.id.create();
    session = await util.createAccountAndAuth();
  });

  teardown(() => {
    util.finish(context);
  });

  test('/account/device/register - no params', async () => {
    let result = await util.post('/account/device/register', {});
    assert.notEqual(result.statusCode, 201);
  });

  test('/account/device/register - invalid session id', async () => {
    let result = await util.post('/account/device/register', {
      session: session,
      name: 'device name',
      deviceId: 'garbage',
      sig: id.sign(id.toString())
    });
    assert.notEqual(result.statusCode, 201);
  });

  test('/account/device/register - invalid signature', async () => {
    let result = await util.post('/account/device/register', {
      session: session,
      name: 'Device Name',
      deviceId: id.toString(),
      sig: 'garbage'
    });
    assert.notEqual(result.status, 201);
  });

  test('/account/device/register - valid signature', async () => {
    let first = await registerDevice(session, id);
    assert.equal(first.statusCode, 201);

    let second = await registerDevice(session, idTwo);
    assert.equal(second.statusCode, 201);
  });

  test('/account/device/register - valid but with id collision', async () => {
    let first = await registerDevice(session, id);
    assert.equal(first.statusCode, 201);

    let second = await registerDevice(session, id);
    assert.notEqual(second.statusCode, 201);
  });
});
