/**
 * @flow
 */
import assert from 'assert';
import createContext from '../context';
import createApi from 'silk-api';

import SasCompositeTable from 'silk-azure-storage/src/sas_composite_table';

suite('device routes', () => {
  let context = createContext();

  let api, account, device;
  setup(async () => {
    api = createApi({
      serverUrl: context.url,
      metrics: {
        type: 'account',
        tags: { },
      },
    });

    account = await context.testAccount();
    device = await context.registeredDevice(account.accessToken);
  });

  test('socket.io address', async () => {
    api.accessToken = device.accessToken;
    let { url } = await api.device.socketioURL({});
    assert.ok(url);
  });

  test('signaling server', async () => {
    api.accessToken = device.accessToken;

    let table = new SasCompositeTable(async () => {
      let { sas } = await api.device.getSasForSignaling({});
      return sas;
    });

    let servers = await table.query();
    assert.ok(Array.isArray(servers));
    let expected = `http://localhost:${context.signaling.port}`;
    assert.ok(servers.some((value) => {
      return value.host === expected;
    }));
  });

  test('factory reset message before unregister', async () => {
    api.accessToken = device.accessToken;
    const {factoryResetMessage} = await api.device.getFactoryResetMessage({});
    assert(factoryResetMessage === null);
  });

  test('bad factory reset message', async () => {
    api.accessToken = device.accessToken;

    let error: ?Error = null;
    try {
      await api.device.unregister({
        factoryResetMessage: `why hello there`,
      });
    } catch (ex) {
      error = ex;
    }

    assert(error);
  });

  test('factory reset message', async () => {
    api.accessToken = device.accessToken;

    let {factoryResetMessage} = await api.device.getFactoryResetMessage({});
    assert.strictEqual(factoryResetMessage, null);

    const message1 = new Buffer('foo').toString('base64');

    await api.device.unregister({
      factoryResetMessage: message1,
    });

    ({factoryResetMessage} = await api.device.getFactoryResetMessage({}));
    assert.equal(factoryResetMessage, message1);

    const message2 = new Buffer('foopy').toString('base64');

    let error: ?Error = null;
    try {
      await api.device.unregister({
        factoryResetMessage: message2,
      });
    } catch (ex) {
      error = ex;
    }

    assert(error);

    ({factoryResetMessage} = await api.device.getFactoryResetMessage({}));
    assert.equal(factoryResetMessage, message1);
  });

  test('messages when connecting to signaling server', async () => {
    const postedMessages = [];
    for (let i = 0; i < 10; i++) {
      postedMessages.push(new Buffer('foo' + i).toString('base64'));
    }

    api.accessToken = account.accessToken;

    for (let message of postedMessages) {
      await api.account.postMessage({
        devicePublicKey: device.accessToken.toString(),
        message,
      });
    }

    api.accessToken = device.accessToken;

    let {messages} = await api.device.getSasForSignaling({});
    assert.deepEqual(messages, postedMessages);

    ({messages} = await api.device.getSasForSignaling({}));
    assert.deepEqual(messages, postedMessages);

    while (messages.length) {
      await api.device.acknowledgeMessage({});
      postedMessages.shift();

      ({messages} = await api.device.getSasForSignaling({}));
      assert.deepEqual(messages, postedMessages);
    }
  });

});
