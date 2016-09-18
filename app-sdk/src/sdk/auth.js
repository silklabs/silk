/**
 * @flow
 */

import * as actions from '../store/actions';

import type {SDKStore} from './store';

export type AccountLoginPasswordMessage = {
  type: 'ACCOUNT_LOGIN_PASSWORD';
  email: string;
  password: string;
};

export type AccountLogin = {
  type: 'ACCOUNT_LOGIN';
  source: string;
  token: string;
};

export type AccountLogoutMessage = {
  type: 'ACCOUNT_LOGOUT';
};

function ACCOUNT_LOGIN_PASSWORD(
  store: SDKStore,
  message: AccountLoginPasswordMessage
) {
  store.dispatch(actions.auth.signInWithPassword({
    userAgent: 'app-sdk',
    email: message.email,
    password: message.password,
  }));
}

function ACCOUNT_LOGIN(
    store: SDKStore,
    message: AccountLogin
) {
  store.dispatch(actions.auth.signInWithOAuth2({
    userAgent: 'app-sdk',
    source: message.source,
    token: message.token,
  }));
}

function ACCOUNT_CREATE(
  store: SDKStore,
  message: AccountLoginPasswordMessage
) {
  store.dispatch(actions.auth.createAccount({
    userAgent: 'app-sdk',
    email: message.email,
    password: message.password,
  }));
}

function ACCOUNT_LOGOUT(
  store: SDKStore,
  message: AccountLogoutMessage
) {
  store.dispatch(actions.auth.signOut());
}

export const messageHandlers = {
  ACCOUNT_LOGIN_PASSWORD,
  ACCOUNT_LOGIN,
  ACCOUNT_CREATE,
  ACCOUNT_LOGOUT,
};
