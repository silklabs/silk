/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import createContext from '../context';
import createApi from '../../../src/api';
import Account from '../../../src/server/models/accounts';

suite('account auth', () => {
  let context = createContext();

  let email = 'one@example.com';
  let id, api, account;
  setup(async () => {
    account = new Account(context.db);
    api = createApi({ serverUrl: context.url });
    id = api.id.create();
    api.vip.key = id;
  });

  test('#createAccount - invalid signature', async () => {
    // Mismatch the public/private keys...
    let fakeId = api.id.create();
    id.priv = fakeId.priv;
    try {
      await api.vip.createAccount({});
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
    assert.ok(create.success);
    let record = await account.findByPublicKey({ publicKey: id.pub });
    assert.equal(record.email, input.email);

    // Ensure we use a new key so we don't hit key duplicate errors...
    api.vip.key = api.id.create();

    let dup = await api.vip.createAccountWithPassword(input);
    assert.ok(!dup.success);
  });

  test('#createAccount - duplicate public key', async () => {
    let input = {
      userAgent: 'woot',
      email: email,
      password: 'password'
    };
    let create = await api.vip.createAccountWithPassword(input);
    assert.ok(create.success);

    input.email = 'another@example.com';
    let dup = await api.vip.createAccountWithPassword(input);
    assert.ok(!dup.success);
  });

  test('#createAccount - success', async () => {
    let create = await api.vip.createAccountWithPassword({
      userAgent: 'woot',
      email: email,
      password: 'password'
    });
    assert.ok(create.success);
    let record = await account.findByPublicKey({ publicKey: id.pub });
    assert.equal(record.email, email);

    let auth = await api.vip.checkPasswordWithPassword({
      email: email,
      password: 'password'
    });
    assert.equal(auth.id, create.id);

    let passCheckFail = await api.vip.checkPasswordWithPassword({
      email: email,
      password: 'fail'
    });
    assert.ok(!passCheckFail.success);
  });

  test('#createAccount - mixed case email', async () => {
    let email = 'one@example.com';
    let emailMixed = 'ONE@example.com';

    let create = await api.vip.createAccountWithPassword({
      userAgent: 'woot',
      email: email,
      password: 'password'
    });
    assert.ok(create.success);

    let auth = await api.vip.checkPasswordWithPassword({
      email: emailMixed,
      password: 'password'
    });
    assert.ok(auth.success);
  });
});

