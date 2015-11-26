/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import createContext from '../context';
import createApi from '../../../src/api';
import Account from '../../../src/server/models/accounts';

suite('account auth', () => {
  let context = createContext();

  let email = 'one@example.com';
  let id, api, accounts;
  setup(async () => {
    accounts = new Account(context.db);
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
    let record = await accounts.findByPublicKey({ publicKey: id.pub });
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
    let record = await accounts.findByPublicKey({ publicKey: id.pub });
    assert.equal(record.email, email);

    let auth = await api.vip.checkPasswordWithPassword({
      email: email,
      password: 'password'
    });
    assert.ok(auth.success);

    let authAgain = await api.vip.checkPasswordWithPassword({
      email: email,
      password: 'password'
    });
    assert.ok(authAgain.success);

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

  suite('#signIn', () => {
    let account = {
      userAgent: 'woot',
      email: email,
      password: 'password'
    };

    setup(async () => {
      let create = await api.vip.createAccountWithPassword(account);
      assert.ok(create.success);
    });

    test('sign in - success', async () => {
      let newKey = api.id.create();
      api.vip.key = newKey;
      let result = await api.vip.signInWithPassword(Object.assign(
        {},
        account
      ));
      assert.ok(result.success);
    });

    test('sign in - wrong password', async () => {
      let newKey = api.id.create();
      api.vip.key = newKey;
      let result = await api.vip.signInWithPassword(Object.assign(
        {},
        account,
        {
          password: 'yousuck'
        }
      ));
      assert.ok(!result.success);
    });
  });


  test('developer account login', async () => {
    let { publicKey, privateKey, email, password } = api.devAccount;
    let id = new api.id(publicKey, privateKey); //eslint-disable-line new-cap
    api.vip.key = id;

    let auth = await api.vip.checkPasswordWithPassword({
      email,
      password
    });

    assert.ok(auth.success, 'dev account login works');
  });

  suite('password reset', function() {

    let account;
    setup(async () => {
      account = await context.testAccount();
      account.api.accessToken = account.api.id.create();
    });

    test('reset password', async () => {
      let reset = await account.api.vip.resetPassword({
        email: account.record.email
      });
      assert(reset.success);

      let {passwordReset} = await accounts.collection.findOne({
        email: account.record.email
      });

      let {pub, priv} = passwordReset.accessToken;
      let accessToken = new api.id(pub, priv);

      let password = context.passwordHash('newpass');
      let useToken = await account.api.vip.usePasswordResetToken({
        email: account.record.email,
        token: accessToken.sign(passwordReset.secret),
        passwordHash: password
      });
      assert(useToken.success);

      let signIn = await account.api.vip.signIn({
        email: account.record.email,
        passwordHash: password,
        userAgent: 'test'
      });
      assert(signIn.success);
    });
  });

});
