/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import createContext from '../context';
import createApi from '../../../src/api';

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

});


