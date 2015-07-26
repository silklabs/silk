/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import api from '../../api';
import * as util from './util';

suite('account creation', () => {
  function makeParams(id, email, name, passphrase) {
    let passhash = util.sha256(passphrase);
    return { id: id.toString(), email: email, name: name,
             passhash: passhash, sig: id.sign(passhash) };
  }

  function createAccount(id, email) {
    return util.post(
      '/account/create',
      makeParams(id, email, 'Test', 'passphrase')
    );
  }


  let email = 'one@example.com';
  let emailTwo = 'two@example.com';
  let id, idTwo, context;
  setup(async () => {
    id = api.id.create();
    idTwo = api.id.create();

    context = await util.setup();
  });

  teardown(() => {
    util.finish(context);
  });

  test('/account/create - invalid id', async () => {
    let body = {
      id: 'garbage', email: 'test@example.org',
      name: 'Test', passhash: util.sha256('passphrase'),
      sig: id.sign(util.sha256('passphrase'))
    };

    let result = await util.post('/account/create', body);
    assert.notEqual(result.statusCode, 201);
  });

  test('/account/create - invalid passhash', async () => {
    let body = {
      id: id.toString(), email: 'test@example.org',
      name: 'Test', passhash: 'garbage',
      sig: id.sign(util.sha256('passphrase'))
    };

    let result = await util.post('/account/create', body);
    assert.notEqual(result.statusCode, 201);
  });

  test('/account/create - invalid signature', async () => {
    let body = {
      id: id.toString(), email: 'test@example.org',
      name: 'Test', passhash: util.sha256('passphrase'),
      sig: 'garbage'
    };

    let result = await util.post('/account/create', body);
    assert.notEqual(result.statusCode, 201);
  });

  test('/account/create - valid', async () => {
    let first = await createAccount(id, email);
    assert.equal(first.statusCode, 201);

    // Cannot use same email twice!
    let sameEmail = await createAccount(idTwo, email);
    assert.notEqual(sameEmail.statusCode, 201);

    // Cannot use same id twice!
    let sameId = await createAccount(id, emailTwo);
    assert.notEqual(sameId.statusCode, 201);

    // Create a second account
    let second = await createAccount(idTwo, emailTwo);
    assert.equal(second.statusCode, 201);
  });
});
