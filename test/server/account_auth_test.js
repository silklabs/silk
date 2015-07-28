/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import createContext from './context';

suite('account auth', () => {
  let context = createContext();

  function challengeReply(id, receipt, passphrase) {
    return id.sign(context.sha256(passphrase) + ' ' + receipt);
  }

  async function successfulChallenge(id) {
    if (!id) {
      id = await context.createAccount('test@example.org', 'Test', 'passphrase');
    }

    let result = await context.post('/account/challenge', { id: id.toString() });
    assert.equal(result.statusCode, 200);

    let receipt = result.body.receipt;
    assert.equal('string', typeof receipt);
    assert.ok(receipt.length > 32);

    return { id, receipt };
  }

  async function successfulAuth(id, receipt) {
    let authResult = await context.post('/account/authenticate', {
      id: id.toString(),
      receipt,
      sig: challengeReply(id, receipt, 'passphrase')
    });

    assert.equal(authResult.statusCode, 200);
    let body = authResult.body;
    assert.equal(typeof body.session, 'string');
    assert.equal(body.session.length, 64);
    return authResult.body;
  }

  test('/account/challenge - no id', async () => {
    let challengeResult = await context.post('/account/challenge', {});
    assert.notEqual(200, challengeResult.statusCode);
  });

  test('/account/challenge - invalid id', async () => {
    let result = await context.post('/account/challenge', { id: 'garbage' });
    assert.notEqual(result.statusCode, 200);
  });

  test('/account/challenge - valid id', async () => {
    let {id} = await successfulChallenge();
    // Auth again with the same id...
    await successfulChallenge(id);
  });

  test('/account/authenticate - valid receipt invalid id', async () => {
    let { id, receipt } = await successfulChallenge();
    let authResult = await context.post('/account/authenticate', {
      id: 'garbage',
      receipt,
      sig: challengeReply(id, receipt, 'passphrase')
    });
    assert.notEqual(authResult.statusCode, 200);
  });

  test('/account/authenticate - valid', async () => {
    // Authenticate with the original challenge
    let { id, receipt } = await successfulChallenge();
    await successfulAuth(id, receipt);

    // Attempt to use same challenge response (replay attack)
    let authResult = await context.post('/account/authenticate', {
      id: id.toString(),
      receipt,
      sig: challengeReply(id, receipt, 'passphrase')
    });

    assert.notEqual(authResult.statusCode);
  });

  test('/account/authenticate - with expired receipt', async () => {
    let { id: idOne, receipt: receiptOne } = await successfulChallenge();
    let { id: idTwo, receipt: receiptTwo } = await successfulChallenge(idOne);

    // Run the initial authentication challenge.
    await successfulAuth(idOne, receiptOne);

    // Run the second one (this should fail since it is now expired).
    let authResult = await context.post('/account/authenticate', {
      id: idTwo.toString(),
      receipt: receiptTwo,
      sig: challengeReply(idTwo, receiptTwo, 'passphrase')
    });

    assert.notEqual(authResult.statusCode, 200);
  });
});
