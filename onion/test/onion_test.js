/**
 * @flow
 */

import assert from 'assert';
import {AccessToken} from 'silk-api';
import * as onion from '..';

suite('onion', () => {

  test('simple roundtrip where sender and recipient know each other', async () => {
    const [senderIdentity, recipientIdentity] = await Promise.all([
      AccessToken.gen(),
      AccessToken.gen(),
    ]);
    const encoded = await onion.genEncode({
      senderIdentity,
      recipientIdentity,
      channel: 'unit_test',
      payload: 'the best payload',
    });

    const decoded = await onion.genDecodeAndVerify({
      input: encoded,
      allowedChannels: ['unit_test'],
      allowedSenders: [senderIdentity],
      recipientIdentity,
    });

    assert.equal(decoded.payload, 'the best payload');
    assert.equal(decoded.senderIdentity.pub, senderIdentity.pub);
  });

  test(`simple roundtrip where sender and recipient don't know each other`, async () => {
    const senderIdentity = await AccessToken.gen();
    const encoded = await onion.genEncodeForUnknownRecipient({
      senderIdentity,
      channel: 'unit_test',
      payload: 'the best payload',
    });

    const decoded = await onion.genDecodeAndVerifyForUnknownParties({
      input: encoded,
      allowedChannels: ['unit_test'],
    });

    assert.equal(decoded.payload, 'the best payload');
    assert.equal(decoded.senderIdentity.pub, senderIdentity.pub);
  });

  test('invalid channel', async () => {
    const [senderIdentity, recipientIdentity] = await Promise.all([
      AccessToken.gen(),
      AccessToken.gen(),
    ]);
    const encoded = await onion.genEncode({
      senderIdentity,
      recipientIdentity,
      channel: 'unit_test',
      payload: 'the best payload',
    });

    let error = null;
    try {
      await onion.genDecodeAndVerify({
        input: encoded,
        allowedChannels: ['test_unit'],
        allowedSenders: [senderIdentity],
        recipientIdentity,
      });
    } catch (ex) {
      error = ex;
    }
    assert(error instanceof Error);
  });

  test('invalid recipient', async () => {
    const [
      senderIdentity,
      recipient1Identity,
      recipient2Identity,
    ] = await Promise.all([
      AccessToken.gen(),
      AccessToken.gen(),
      AccessToken.gen(),
    ]);
    const encoded = await onion.genEncode({
      senderIdentity,
      recipientIdentity: recipient1Identity,
      channel: 'unit_test',
      payload: 'the best payload',
    });

    let error = null;
    try {
      await onion.genDecodeAndVerify({
        input: encoded,
        allowedChannels: ['unit_test'],
        allowedSenders: [senderIdentity],
        recipientIdentity: recipient2Identity,
      });
    } catch (ex) {
      error = ex;
    }
    assert(error instanceof Error);
  });

  test('invalid sender', async () => {
    const [
      sender1Identity,
      sender2Identity,
      recipientIdentity,
    ] = await Promise.all([
      AccessToken.gen(),
      AccessToken.gen(),
      AccessToken.gen(),
    ]);
    const encoded = await onion.genEncode({
      senderIdentity: sender1Identity,
      recipientIdentity,
      channel: 'unit_test',
      payload: 'the best payload',
    });

    let error = null;
    try {
      await onion.genDecodeAndVerify({
        input: encoded,
        allowedChannels: ['unit_test'],
        allowedSenders: [sender2Identity],
        recipientIdentity,
      });
    } catch (ex) {
      error = ex;
    }
    assert(error instanceof Error);
  });

  test('manipulate every byte', async () => {
    const [senderIdentity, recipientIdentity] = await Promise.all([
      AccessToken.gen(),
      AccessToken.gen(),
    ]);
    const encoded = await onion.genEncode({
      senderIdentity,
      recipientIdentity,
      channel: 'unit_test',
      payload: 'the best payload',
    });

    for (let i = 0; i < encoded.length; i++) {
      const input = Buffer.from(encoded);
      input[i] = (input[i] + 1) % 255;

      let error = null;
      try {
        await onion.genDecodeAndVerify({
          input,
          allowedChannels: ['unit_test'],
          allowedSenders: [senderIdentity],
          recipientIdentity,
        });
      } catch (ex) {
        error = ex;
      }
      assert(error instanceof Error);
    }
  });
});
