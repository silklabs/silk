/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import createContext from './context';

suite('device authentication', () => {
  let context = createContext();
  async function successfulChallenge(id) {
    let result = await context.post('/device/challenge', { id: id.toString() });
    assert.equal(result.statusCode, 200);
    let receipt = result.body.receipt;
    assert.equal('string', typeof receipt);
    assert.ok(receipt.length > 32);
    return { receipt };
  }


  let id;
  setup(async () => {
    id = await context.createDevice();
  });

  test('/device/challenge - empty', async () => {
    let result = await context.post('/device/challenge', {});
    assert.notEqual(result.statusCode, 200);
  });

  test('/device/challenge - invalid id', async () => {
    let result = await context.post('/device/challenge', { id: 'garbage' });
    assert.notEqual(result.statusCode, 200);
  });

  test('/device/challenge - valid', async () => {
    await successfulChallenge(id);
  });

  test('/device/authenticate - invalid receipt', async () => {
    let { receipt } = await successfulChallenge(id);
    let result = context.post('/device/authenticate', {
      id: id.toString(),
      receipt: 'garbage',
      sig: id.sign(receipt)
    });
    assert.notEqual(result.statusCode, 201);
  });

  test('/device/authenticate - signature receipt', async () => {
    let { receipt } = await successfulChallenge(id);
    let result = context.post('/device/authenticate', {
      id: id.toString(),
      receipt: receipt,
      sig: 'garbage'
    });
    assert.notEqual(result.statusCode, 201);
  });

  test('/device/authenticate - success', async () => {
    let { receipt: receiptOne } = await successfulChallenge(id);
    let { receipt: receiptTwo } = await successfulChallenge(id);
    let result = await context.post('/device/authenticate', {
      id: id.toString(),
      receipt: receiptOne,
      sig: id.sign(receiptOne)
    });
    assert.equal(result.statusCode, 200);
    assert.equal('string', typeof result.body.session);
    assert.equal(result.body.session.length, 64);

    // Cannot use expired receipt...
    let expiredReceipt = await context.post('/device/authenticate', {
      id: id.toString(),
      receipt: receiptTwo,
      sig: id.sign(receiptTwo)
    });
    assert.notEqual(expiredReceipt.statusCode, 200);

    // Cannot use same receipt twice...
    let sameReceipt = await context.post('/device/authenticate', {
      id: id.toString(),
      receipt: receiptOne,
      sig: id.sign(receiptOne)
    });
    assert.notEqual(sameReceipt.statusCode, 200);
  });
});
