/**
 * @flow
 */
import assert from 'assert';
import createApi, {AccessToken} from 'silk-api';
import uuid from 'uuid';
import SasCompositeTable from 'silk-azure-storage/src/sas_composite_table';

import {
  TableClient,
  SharedKeyAuth,
} from 'silk-azure-storage/src/table';

import createContext from '../context';
import Devices from '../../../src/server/models/devices';

import type {RawPasswordInput} from 'silk-api/src/vip';

const invariant = assert;

const dummyFactoryResetMessage = new Buffer('foo').toString('base64');

suite('account auth', () => {
  let context = createContext();

  let api, devices;
  let accountOne, accountTwo;
  setup(async () => {
    devices = new Devices(context.db);
    api = createApi({
      serverUrl: context.url,
      metrics: {
        type: 'account',
        tags: { },
      },
    });

    accountOne = await context.testAccount();
    accountTwo = await context.testAccount();
  });

  test('/register_device - success', async () => {
    api.accessToken = accountOne.accessToken;

    const deviceAccessToken = await AccessToken.gen();
    const token = await accountOne.accessToken.genSign(
      deviceAccessToken.toString()
    );

    let result = await api.account.registerDevice({
      devicePublicKey: deviceAccessToken.toString(),
      name: 'test',
      type: 'camera',
      registrationToken: token,
    });
    assert.ok(result.success);
    assert.ok(result.beaconUUID);

    let dup = await api.account.registerDevice({
      devicePublicKey: deviceAccessToken.toString(),
      name: 'test',
      type: 'camera',
      registrationToken: token,
    });
    assert.ok(dup.success, 'idempotent');

    // Idempotent but should not result in multiple devices in list.
    let allByPubKey = await devices.collection.find({
      'accessToken.publicKey': deviceAccessToken.toString(),
    }).toArray();
    assert.equal(allByPubKey.length, 1);

    let device = await devices.findByPublicKey({
      publicKey: deviceAccessToken.toString(),
    });
    invariant(device);
    assert.equal(device.accountId, accountOne.record._id.toString());

    // Act as the device rather then the account...
    api.accessToken = deviceAccessToken;
    let complete = await api.device.completeRegistration({
      registrarPublicKey: accountOne.accessToken.toString(),
      registrationToken: token,
    });
    assert.ok(complete.success);
    assert.ok(complete.beaconUUID);
    assert.equal(complete.accountDeviceNumber, 1);

    let deviceAfterComplete = await devices.findByPublicKey({
      publicKey: deviceAccessToken.toString(),
    });
    invariant(deviceAfterComplete);
    assert.ok(deviceAfterComplete.registration.complete);
    assert.ok(deviceAfterComplete.registered);

    // The device is allowed to unregister itself
    let unregister = await api.device.unregister({
      factoryResetMessage: dummyFactoryResetMessage,
    });
    assert.ok(unregister.success);
    let deviceAfterUnregister = await devices.findByPublicKey({
      publicKey: deviceAccessToken.toString(),
    });
    invariant(deviceAfterUnregister);
    assert.ok(!deviceAfterUnregister.registered);

    // ...but not twice
    let err;
    try {
      await api.device.unregister({
        factoryResetMessage: dummyFactoryResetMessage,
      });
    } catch (error) {
      err = error;
    }
    invariant(err);
    assert.equal(err.code, 403);
  });

  suite('with devices', () => {
    const numberOfDevices = 15;
    let devices;

    setup(async function () {
      this.timeout('30s');
      api.accessToken = accountOne.accessToken;

      const ops = [];
      for (let i = 0; i < numberOfDevices; i++) {
        ops.push(context.registeredDevice(accountOne.accessToken));
      }

      devices = await Promise.all(ops);

      // Create another account just to be sure we are not contaminating our
      // state.
      api.accessToken = accountTwo.accessToken;
      await context.registeredDevice(accountTwo.accessToken);

      // Do not assume a particular account in the below tests...
      api.accessToken = null;
    });

    test('POST /list_devices', async () => {
      api.accessToken = accountOne.accessToken;
      let result = await api.account.listDevices({});
      assert.equal(result.devices.length, numberOfDevices);

      const ids = result.devices.map((device) => device.accountDeviceNumber);
      const expected = [];
      ids.sort((a, b) => {
        return a - b;
      });
      for (let i = 1; i <= numberOfDevices; i++) {
        expected.push(i);
      }
      assert.deepEqual(ids, expected);
    });

    test('POST /unregister_device', async () => {
      api.accessToken = accountOne.accessToken;
      await api.account.unregisterDevice({
        devicePublicKey: devices[0].accessToken.toString(),
        factoryResetMessage: dummyFactoryResetMessage,
      });

      let list = await api.account.listDevices({});
      assert.equal(list.devices.length, 14);


      api.accessToken = devices[0].accessToken;
      // Make sure that the device can no longer make api calls.
      let err;
      try {
        await api.device.socketioURL({});
      } catch (error) {
        err = error;
      }
      invariant(err);
      assert.equal(err.code, 403);
    });
  });

  test('socket.io address', async () => {
    api.accessToken = accountOne.accessToken;
    let { url } = await api.account.socketioURL({});
    assert.ok(url);
  });

  if (process.env.INFLUX_CONNECTION_STRING) {
    test('read / writeMetrics', async () => {
      let series = uuid.v4().replace(/-/g, '');
      let points = [
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
    test.skip('read / writeMetrics (skipped)');
  }

  test('metrics query scopes', async () => {
    // See config/test.js to see what is enabled....
    let allowed = await context.testAccount({ email: 'scoped@example.com' });
    let invalid = await context.testAccount({ email: 'user@noscopesforyou.com' });

    await allowed.api.account.queryMetrics({
      // We don't care about the results only that we don't get hit with the 401
      query: 'does not matter',
    });

    await context.assertThrows(async () => {
      await invalid.api.account.queryMetrics({ query: 'does not matter' });
    }, /Unauthorized/);
  });

  test('POST /sas_signaling_devices', async () => {
    api.accessToken = accountOne.accessToken;

    const root = new TableClient(
      new SharedKeyAuth(context.config.azure.regions.uswest)
    );

    const { accountId } = await api.account.whoami({});
    const client = new SasCompositeTable(async () => {
      let { sas } = await api.account.getSasForDeviceSignaling({});
      return sas;
    });

    // Make a valid query ...
    let devices = await client.query({
      // NOTE: It's unfortunate that we need to call this "PartitionKey" but
      // this is a massively faster query (indexed).
      PartitionKey: accountId,
    });
    assert.ok(Array.isArray(devices));

    // Insert some garbage that we should not be able to query with these
    // credentials...
    await root.mergeOrInsertEntity(
      context.config.azure.tables.sigdevices,
      {
        PartitionKey: 'foobar',
        RowKey: 'bar',
      }
    );

    // SAS permissions do not actively prevent queries to ranges outside of the
    // scope but they instead cause all queries outside of primary key range to
    // return nothing.
    let outOfScope = await client.query({
      // valid but outside of our signed range query.
      PartitionKey: 'foobar',
    });
    assert.equal(outOfScope.length, 0);
  });

  suite('with multiple clients and password', () => {
    const numberOfClients = 30;
    const clientPublicKeys = [];

    const input: RawPasswordInput = {
      userAgent: 'flippety',
      email: 'flippety@floppety.flu',
      password: 'floppety',
    };

    setup(async function () {
      this.timeout('30s');

      api.accessToken = await AccessToken.gen();
      clientPublicKeys.push(api.accessToken.pub);

      let {success} = await api.vip.createAccountWithPassword(input);
      assert(success);

      for (let index = 0; index < numberOfClients - 1; index++) {
        const newKey = await AccessToken.gen();
        api.accessToken = newKey;
        ({success} = await api.vip.signInWithPassword(input));
        assert(success);
        clientPublicKeys.push(newKey.pub);
      }

      clientPublicKeys.sort();
    });

    test('POST /list_clients', async () => {
      const {clients} = await api.account.listClients({});
      assert.equal(clients.length, numberOfClients);

      const publicKeys = clients.map((client) => client.publicKey);
      publicKeys.sort();

      assert.deepEqual(clientPublicKeys, publicKeys);
    });

    test('POST /list_clients without valid accessToken', async () => {
      api.accessToken = await AccessToken.gen();

      let error: Error;
      try {
        await api.account.listClients({});
      } catch (ex) {
        error = ex;
      }
      assert(error instanceof Error);
    });
  });

});
