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
    let { url } = await api.device.socketioURL();
    assert.ok(url);
  });

  test('signaling server', async () => {
    api.accessToken = device.accessToken;

    let table = new SasCompositeTable(async () => {
      let { sas } = await api.device.getSasForSignaling();
      return sas;
    });

    let servers = await table.query();
    assert.ok(Array.isArray(servers));
    let expected = `http://localhost:${context.signaling.port}`;
    assert.ok(servers.some((value) => {
      return value.host === expected
    }));
  });

});
