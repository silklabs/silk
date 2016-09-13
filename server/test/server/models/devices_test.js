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
        let device = await subject.findByPublicKey({
          publicKey: deviceId.toString(),
        });
        invariant(device);
        assert.equal(device.registration.complete, true);
        assert.equal(device.accountId.toString(), account.id);
        assert.equal(device.registration.accountDeviceNumber, 1);
        assert(device.factoryResetMessage === undefined);
      });

      test('removes accountDeviceNumber on delete', async () => {
        const factoryResetMessage = new Buffer('foo').toString('base64');
        await subject.unregister({
          publicKey: deviceId.toString(),
          factoryResetMessage,
        });

        let device = await subject.findByPublicKey({
          publicKey: deviceId.toString(),
        });
        invariant(device);

        assert(device.registration.accountDeviceNumber === undefined);
        assert.equal(device.factoryResetMessage, factoryResetMessage);
      });

    });

    test('signature mismatch', async () => {
      const registrationToken = await accountId.genSign('thisisfake');
      let result = await subject.validateRegistration(accountId.toString(), {
        publicKey: deviceId.toString(),
        registrationToken,
      });
      invariant(result.error);
      invariant(result.error.type);
      assert.equal(result.error.type, 'InvalidRegistrationToken');

      let device = await subject.findByPublicKey({
        publicKey: deviceId.toString(),
      });
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

});
