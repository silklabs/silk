/**
 * @flow
 */

import assert from 'assert';
import Devices from '../../../src/server/models/devices';
import Accounts from '../../../src/server/models/accounts';
import createContext from '../context';
import AccessToken from 'silk-api/src/access_token';

const invariant = assert;

suite('devices', () => {
  let context = createContext();

  let accounts, subject;
  setup(() => {
    accounts = new Accounts(context.db);
    subject = new Devices(context.db);
  });

  suite('.register', () => {
    let account, deviceId, accountId;

    setup(async () => {
      deviceId = await AccessToken.gen();
      accountId = await AccessToken.gen();

      account = await accounts.create({
        publicKey: accountId.toString(),
        email: 'user@example.com',
        passwordHash: context.passwordHash('password'),
        userAgent: 'nodejs',
      });

      const registrationToken = await accountId.genSign(deviceId.toString());
      await subject.register(accountId.toString(), {
        accountId: account.id,
        publicKey: deviceId.toString(),
        name: 'foobar',
        type: 'camera',
        // Note: Devices model will not validate this...
        registrationToken,
      });
    });

    suite('normal lifecycle', function () {

      setup(async() => {
        const registrationToken = await accountId.genSign(deviceId.toString());
        let result = await subject.validateRegistration(accountId.toString(), {
          publicKey: deviceId.toString(),
          registrationToken,
        });
        invariant(!result.error);
        invariant(result.accountDeviceNumber);
      });

      test('successfully registers device', async () => {
        const publicKey = deviceId.toString();
        const device = await subject.findByPublicKey(publicKey);
        invariant(device);
        assert.equal(device.registration.complete, true);
        assert.equal(device.accountId.toString(), account.id);
        assert.equal(device.registration.accountDeviceNumber, 1);
        assert(device.factoryResetMessage === undefined);
      });

      test('no device messages at first', async () => {
        const publicKey = deviceId.toString();
        let device = await subject.findByPublicKey(publicKey);
        invariant(device);
        assert.strictEqual(device.mailbox, undefined);

        const messages = await subject.getMessages(publicKey);
        invariant(Array.isArray(messages));
        assert.strictEqual(messages.length, 0);

        device = await subject.findByPublicKey(publicKey);
        invariant(device);
        assert.strictEqual(device.mailbox, undefined);
      });

      test('device messages', async () => {
        const publicKey = deviceId.toString();
        const message1 = new Buffer('foo').toString('base64');
        const message2 = new Buffer('bar').toString('base64');
        const message3 = new Buffer('baz').toString('base64');

        let device = await subject.findByPublicKey(publicKey);
        invariant(device);
        assert.strictEqual(device.mailbox, undefined);

        let result = await subject.addToMailbox({publicKey, message: message1});
        invariant(!result.error);

        result = await subject.addToMailbox({publicKey, message: message2});
        invariant(!result.error);

        result = await subject.addToMailbox({publicKey, message: message2});
        invariant(!result.error);

        // Add duplicate message that won't get added to the db.
        result = await subject.addToMailbox({publicKey, message: message3});
        invariant(!result.error);

        let messages = await subject.getMessages(publicKey);
        invariant(Array.isArray(messages));
        assert.equal(messages.length, 3);
        assert.deepEqual(messages, [message1, message2, message3]);

        device = await subject.findByPublicKey(publicKey);
        invariant(device);
        assert.deepEqual(device.mailbox, messages);

        while (messages.length) {
          result = await subject.acknowledgeMessage(publicKey);
          invariant(!result.error);

          messages.shift();

          const currentMessages = await subject.getMessages(publicKey);
          invariant(Array.isArray(currentMessages));
          assert.deepEqual(messages, currentMessages);

          device = await subject.findByPublicKey(publicKey);
          invariant(device);
          assert.deepEqual(device.mailbox, messages);
        }

        messages = await subject.getMessages(publicKey);
        invariant(Array.isArray(messages));
        assert.equal(messages.length, 0);

        result = await subject.addToMailbox({publicKey, message: message1});
        invariant(!result.error);

        messages = await subject.getMessages(publicKey);
        invariant(Array.isArray(messages));
        assert.deepEqual(messages, [message1]);
      });

      test('removes state on delete', async () => {
        const publicKey = deviceId.toString();
        let device = await subject.findByPublicKey(publicKey);
        invariant(device);

        assert.strictEqual(device.registered, true);
        assert(device.registration.accountDeviceNumber);
        assert.strictEqual(device.factoryResetMessage, undefined);

        const factoryResetMessage = new Buffer('foo').toString('base64');
        await subject.unregister({
          publicKey,
          factoryResetMessage,
        });

        device = await subject.findByPublicKey(publicKey);
        invariant(device);

        assert.strictEqual(device.registered, false);
        assert.strictEqual(device.registration.accountDeviceNumber, undefined);
        assert.strictEqual(device.factoryResetMessage, factoryResetMessage);
      });

      test('removes mailbox on delete', async () => {
        const publicKey = deviceId.toString();
        const message = new Buffer('foo').toString('base64');

        let result = await subject.getMessages(publicKey);
        invariant(Array.isArray(result));
        assert.strictEqual(result.length, 0);

        result = await subject.addToMailbox({publicKey, message});
        invariant(!result.error);

        result = await subject.getMessages(publicKey);
        invariant(Array.isArray(result));
        assert.deepEqual(result, [message]);

        await subject.unregister({
          publicKey,
          factoryResetMessage: new Buffer('foo').toString('base64'),
        });

        const device = await subject.findByPublicKey(publicKey);
        invariant(device);

        assert.strictEqual(device.mailbox, undefined);

        result = await subject.getMessages(publicKey);
        invariant(result.error);
        invariant(result.error.type);
        assert.equal(result.error.type, 'UnknownDevice');
      });

      test('device messages after unregister', async () => {
        const publicKey = deviceId.toString();
        const message = new Buffer('foo').toString('base64');

        await subject.unregister({
          publicKey,
          factoryResetMessage: new Buffer('foo').toString('base64'),
        });

        let result = await subject.getMessages(publicKey);
        invariant(result.error);
        invariant(result.error.type);
        assert.equal(result.error.type, 'UnknownDevice');

        result = await subject.addToMailbox({publicKey, message});
        invariant(result.error);
        invariant(result.error.type);
        assert.equal(result.error.type, 'UnknownDevice');

        result = await subject.getMessages(publicKey);
        invariant(result.error);
        invariant(result.error.type);
        assert.equal(result.error.type, 'UnknownDevice');

        result = await subject.acknowledgeMessage(publicKey);
        invariant(result.error);
        invariant(result.error.type);
        assert.equal(result.error.type, 'UnknownDevice');
      });

    });

    test('signature mismatch', async () => {
      const registrationToken = await accountId.genSign('thisisfake');
      const result = await subject.validateRegistration(accountId.toString(), {
        publicKey: deviceId.toString(),
        registrationToken,
      });
      invariant(result.error);
      invariant(result.error.type);
      assert.equal(result.error.type, 'InvalidRegistrationToken');

      const publicKey = deviceId.toString();
      const device = await subject.findByPublicKey(publicKey);
      invariant(device);

      assert.equal(device.registration.complete, false);
      assert.equal(device.accountId.toString(), account.id);
    });
  });

  test('.belongsToAccount', async () => {
    let firstPair = await context.testPair();
    let firstSecondDevice =
      await context.registeredDevice(firstPair.account.accessToken);

    let secondPair = await context.testPair();
    let firstAccountId = firstPair.account.record._id;

    assert(await subject.belongsToAccount(
      firstAccountId,
      firstPair.device.accessToken.toString()
    ), 'single match');

    assert(await subject.belongsToAccount(
      firstAccountId,
      firstPair.device.accessToken.toString(),
      firstSecondDevice.accessToken.toString(),
    ), 'multiple match');

    assert(!await subject.belongsToAccount(
      firstAccountId,
      secondPair.device.accessToken.toString(),
    ), 'mismatch');

    assert(!await subject.belongsToAccount(
      firstAccountId,
      firstPair.device.accessToken.toString(),
      secondPair.device.accessToken.toString(),
    ), 'mixed matching and not matching');
  });

  test('device messages with bad id', async () => {
    const publicKey = (await AccessToken.gen()).toString();

    let result = await subject.getMessages(publicKey);
    invariant(result.error);
    invariant(result.error.type);
    assert.equal(result.error.type, 'UnknownDevice');

    result = await subject.acknowledgeMessage(publicKey);
    invariant(result.error);
    invariant(result.error.type);
    assert.equal(result.error.type, 'UnknownDevice');

    result = await subject.addToMailbox({
      publicKey,
      message: new Buffer('foo').toString('base64'),
    });
    invariant(result.error);
    invariant(result.error.type);
    assert.equal(result.error.type, 'UnknownDevice');
  });

});
