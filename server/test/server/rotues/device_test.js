/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import createContext from '../context';
import createApi from '../../../src/api';

suite('device routes', () => {
  let context = createContext();

  let api, account, device;
  setup(async () => {
    api = createApi({ serverUrl: context.url });

    account = await context.testAccount();
    device = await context.registeredDevice(account.accessToken);
  });

  test('socket.io address', async () => {
    api.accessToken = device.accessToken;
    let { url } = await api.device.socketioURL();
    assert.ok(url);
  });
});
