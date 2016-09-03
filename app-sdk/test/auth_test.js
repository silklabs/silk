/**
 * @flow
 */

import assert from 'assert';
import thunk from 'redux-thunk';
import {SilkApi, AccessToken} from 'silk-api';
import version from 'silk-core-version';
import uuid from 'uuid';

// $FlowFixMe: not sure why it doesn't like this.
import createContext from '../../server/test/server/context';
import * as actions from '../src/store/actions';
import createStore from '../src/store';

const API_CONFIG = {
  serverUrl: 'http://localhost:5000',
  metrics: {
    type: 'account',
    tags: {},
  },
};

function whenAuthenticated(store): Promise<void> {
  return new Promise((resolve) => {
    store.subscribe(() => store.getState().auth.isAuthenticated && resolve());
  });
}

async function genTestAccount(api) {
  const accountInfo = {
    userAgent: 'mocha',
    email: uuid.v4() + '@example.com',
    password: 'password',
  };
  api.accessToken = await AccessToken.gen();
  await api.vip.createAccountWithPassword(accountInfo);
  api.accessToken = null;
  return accountInfo;
}

suite('store', () => {
  const serverContext = createContext();

  test('api', () => {
    const store = createStore();
    assert.strictEqual(store.getState().api, null);

    store.dispatch(actions.api.create({
      ...API_CONFIG,
      serverUrl: serverContext.url,
    }));
    assert(store.getState().api instanceof SilkApi);

    const {api} = store.getState();
    assert.strictEqual(api.config.serverUrl, serverContext.url);
  });

  test('createAccount success', async () => {
    const store = createStore();
    store.dispatch(actions.api.create({
      ...API_CONFIG,
      serverUrl: serverContext.url,
    }));
    store.dispatch(actions.auth.createAccount({
      userAgent: 'mocha',
      email: uuid.v4() + '@example.com',
      password: 'password',
    }));

    await whenAuthenticated(store);
  });

  test('signIn success', async () => {
    const accountInfo = await genTestAccount(serverContext.api);
    const store = createStore();
    store.dispatch(actions.api.create({
      ...API_CONFIG,
      serverUrl: serverContext.url,
    }));

    store.dispatch(actions.auth.signInWithPassword(accountInfo));
    await whenAuthenticated(store);
  });
});
