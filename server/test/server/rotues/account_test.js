/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import createContext from '../context';
import createApi from '../../../src/api';
import uuid from 'uuid';

import Devices from '../../../src/server/models/devices';

suite('account auth', () => {
  let context = createContext();

  let api, devices;
  let accountOne, accountTwo;
  setup(async () => {
    devices = new Devices(context.db);
    api = createApi({ serverUrl: context.url });

    accountOne = await context.testAccount();
    accountTwo = await context.testAccount();
  });

  test('/register_device - success', async () => {
    api.accessToken = accountOne.accessToken;

    let deviceAccessToken = api.id.create();
    let token = accountOne.accessToken.sign(
      deviceAccessToken.toString()
    );

    let result = await api.account.registerDevice({
      devicePublicKey: deviceAccessToken.toString(),
      name: 'test',
      type: 'camera',
      registrationToken: token
    });
    assert.ok(result.success);
    assert.ok(result.beaconUUID);

    let dup = await api.account.registerDevice({
      devicePublicKey: deviceAccessToken.toString(),
      name: 'test',
      type: 'camera',
      registrationToken: token
    });
    assert.ok(dup.success, 'idempotent');

    // Idempotent but should not result in multiple devices in list.
    let allByPubKey = await devices.collection.find({
      'accessToken.publicKey': deviceAccessToken.toString()
    });
    assert.equal(allByPubKey.length, 1);

    let device = await devices.findByPublicKey({
      publicKey: deviceAccessToken.toString()
    });

    assert.equal(device.accountId, accountOne.record._id.toString());

    // Act as the device rather then the account...
    api.accessToken = deviceAccessToken;
    let complete = await api.device.completeRegistration({
      registrarPublicKey: accountOne.accessToken.toString(),
      registrationToken: token
    });
    assert.ok(complete.success);
    assert.ok(complete.beaconUUID);

    let deviceAfterComplete = await devices.findByPublicKey({
      publicKey: deviceAccessToken.toString()
    });
    assert.ok(deviceAfterComplete.registration.complete);
  });

  suite('with devices', () => {
    let deviceOne, deviceTwo;
    setup(async () => {
      api.accessToken = accountOne.accessToken;
      [deviceOne, deviceTwo] = await Promise.all([
        context.registeredDevice(accountOne.accessToken),
        context.registeredDevice(accountOne.accessToken),
      ]);

      // Create another account just to be sure we are not contaminating our
      // state.
      api.accessToken = accountTwo.accessToken;
      context.registeredDevice(accountTwo.accessToken);

      // Do not assume a particular account in the below tests...
      api.accessToken = null;
    });

    test('POST /list_devices', async () => {
      api.accessToken = accountOne.accessToken;
      let result = await api.account.listDevices();
      assert.equal(result.devices.length, 2);
    });

    test('POST /unregister_device', async () => {
      api.accessToken = accountOne.accessToken;
      await api.account.unregisterDevice({
        devicePublicKey: deviceOne.accessToken.toString()
      });

      let { devices } = await api.account.listDevices();
      assert.equal(devices.length, 1);
      assert.deepEqual(
        devices[0].publicKey,
        deviceTwo.accessToken.toString()
      );
    });
  });

  test('socket.io address', async () => {
    api.accessToken = accountOne.accessToken;
    let { url } = await api.account.socketioURL();
    assert.ok(url);
  });

  if (process.env.INFLUX_CONNECTION_STRING) {
    test('read / writeMetrics', async () => {
      let series = uuid.v4().replace(/-/g, '');
      let points  = [
        [series, { tag: 'a' }, { value: '1i' }],
        [series, { tag2: 'a' }, { value: '2i' }],
        [series, { tag3: 'a' }, { value: '3i' }],
      ];

      await accountOne.api.account.writeMetrics({ points });

      // read the metrics back out...
      let read = await accountOne.api.account.queryMetrics({ query: `
        SELECT * FROM account_${series}
      `});
      assert.equal(read.results[0].series[0].values.length, 3);
    });
  } else {
    test.skip('read / writeMetrics');
  }

  test('metrics query scopes', async () => {
    // See config/test.js to see what is enabled....
    let allowed = await context.testAccount({ email: 'scoped@example.com' });
    let invalid = await context.testAccount({ email: 'user@noscopesforyou.com' });

    await allowed.api.account.queryMetrics({
      // We don't care about the results only that we don't get hit with the 401
      query: 'does not matter'
    });

    await context.assertThrows(async () => {
      await invalid.api.account.queryMetrics({ query: 'does not matter' });
    }, /Unauthorized/);
  });
});
