import assert from 'assert';
import {applyMiddleware, createStore, combineReducers} from 'redux';
import thunk from 'redux-thunk';
import {SilkApi, AccessToken} from 'silk-api';
import version from 'silk-core-version';
import uuid from 'uuid';

import createContext from '../../server/test/server/context';
import * as actions from '../src/store/actions';
import {reducer as apiReducer} from '../src/store/api';
import {reducer as authReducer} from '../src/store/auth_reducers';

const API_CONFIG = {
  serverUrl: 'http://localhost:5000',
  metrics: {
    type: 'account',
    tags: {},
  },
};

function makeStore() {
  const reducer = combineReducers({api: apiReducer, auth: authReducer});
  return createStore(reducer, applyMiddleware(thunk));
}

function whenAuthenticated(store): Promise<void> {
  return new Promise((resolve) => {
    store.subscribe(() => store.getState().auth.authenticated && resolve());
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
    const store = makeStore();
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
    const store = makeStore();
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
    const store = makeStore();
    store.dispatch(actions.api.create({
      ...API_CONFIG,
      serverUrl: serverContext.url,
    }));

    store.dispatch(actions.auth.signIn(accountInfo));
    await whenAuthenticated(store);
  });
});
