/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import createContext from '../context';
import createApi from '../../../src/api';

suite('account auth', () => {
  let context = createContext();

  let email = 'one@example.com';
  let id, api;
  setup(async () => {
    api = createApi({ serverUrl: context.url });
    id = api.id.create();
    api.vip.key = id;
  });

  test('#createAccount - invalid signature', async () => {
    // Mismatch the public/private keys...
    let fakeId = api.id.create();
    id.priv = fakeId.priv;
    try {
      await api.vip.createAccount({
        publicKey: id.toString()
      });
    } catch (err) {
      assert.equal(err.code, 403);
      return;
    }
    throw new Error('expected an error');
  });

  test('#createAccount - duplicate email', async () => {
    let input = {
      userAgent: 'woot',
      email: email,
      password: 'password'
    };
    let create = await api.vip.createAccountWithPassword(input);
    assert.ok(create.id);

    // Ensure we use a new key so we don't hit key duplicate errors...
    api.vip.key = api.id.create();

    try {
      await api.vip.createAccountWithPassword(input);
    } catch (err) {
      assert.ok(err.message.indexOf('Duplicate') !== -1);
      assert.equal(err.code, 400);
      return;
    }
    throw new Error('expected an error');
  });

  test('#createAccount - duplicate public key', async () => {
    let input = {
      userAgent: 'woot',
      email: email,
      password: 'password'
    };
    let create = await api.vip.createAccountWithPassword(input);
    assert.ok(create.id);
    try {
      input.email = 'another@example.com';
      await api.vip.createAccountWithPassword(input);
    } catch (err) {
      assert.ok(err.message.indexOf('Duplicate') !== -1);
      assert.equal(err.code, 400);
      return;
    }
    throw new Error('expected an error');
  });

  test('#createAccount - success', async () => {
    let create = await api.vip.createAccountWithPassword({
      userAgent: 'woot',
      email: email,
      password: 'password'
    });
    assert.ok(create.id);

    let auth = await api.vip.checkPasswordWithPassword({
      email: email,
      password: 'password'
    });
    assert.equal(auth.id, create.id);

    try {
      await api.vip.checkPasswordWithPassword({
        email: email,
        password: 'fail'
      });
    } catch (err) {
      assert.equal(err.status, 400);
      return;
    }
    throw new Error('expected error...');
  });

  test('#createAccount - mixed case email', async () => {
    let email = 'one@example.com';
    let emailMixed = 'ONE@example.com';

    let create = await api.vip.createAccountWithPassword({
      userAgent: 'woot',
      email: email,
      password: 'password'
    });
    assert.ok(create.id);

    let auth = await api.vip.checkPasswordWithPassword({
      email: emailMixed,
      password: 'password'
    });
    assert.equal(auth.id, create.id);
  });
});

