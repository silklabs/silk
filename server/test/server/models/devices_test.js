import assert from 'assert';
import Devices from '../../../src/server/models/devices';
import Accounts from '../../../src/server/models/accounts';
import createContext from '../context';
import id from 'silk-api/src/access_token';

suite('devices', () => {
  let context = createContext();

  let accounts, subject;
  setup(async () => {
    accounts = new Accounts(context.db);
    subject = new Devices(context.db);
  });

  suite('.register', () => {
    let deviceId = id.create();
    let accountId = id.create();
    let account;

    setup(async () => {
      account = await accounts.create({
        publicKey: accountId.toString(),
        email: 'user@example.com',
        passwordHash: context.passwordHash('password'),
        userAgent: 'nodejs'
      });
    });

    setup(async () => {
      await subject.register(accountId.toString(), {
        accountId: account.id,
        publicKey: deviceId.toString(),
        name: 'foobar',
        type: 'camera',
        // Note: Devices model will not validate this...
        registrationToken: accountId.sign(deviceId.toString())
      });
    });

    test('successfully authenticate token', async () => {
      let result = await subject.validateRegistration(accountId.toString(), {
        publicKey: deviceId.toString(),
        registrationToken: accountId.sign(deviceId.toString())
      });
      assert.ok(result.success);

      let device = await subject.findByPublicKey({
        publicKey: deviceId.toString()
      });
      assert.equal(device.registration.complete, true);
      assert.equal(device.accountId.toString(), account.id);
    });

    test('signature mismatch', async () => {
      let result = await subject.validateRegistration(accountId.toString(), {
        publicKey: deviceId.toString(),
        registrationToken: accountId.sign('thisisfake')
      });
      assert.ok(result.error);
      assert.equal(result.error.type, 'InvalidRegistrationToken');

      let device = await subject.findByPublicKey({
        publicKey: deviceId.toString()
      });
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
