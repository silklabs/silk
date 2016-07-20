/**
 * @flow
 */

import * as actions from '../store/actions';

import type {Store} from './store';

export type AccountLoginPasswordMessage = {
  type: 'ACCOUNT_LOGIN';
  email: string;
  password: string;
};

export type AccountLogoutMessage = {
  type: 'ACCOUNT_LOGOUT'
};

function ACCOUNT_LOGIN_PASSWORD(
  store: Store,
  message: AccountLoginPasswordMessage
) {
  store.dispatch(actions.auth.signIn({
    userAgent: 'app-sdk',
    email: message.email,
    password: message.password,
  }));
}

function ACCOUNT_CREATE(
  store: Store,
  message: AccountLoginPasswordMessage
) {
  store.dispatch(actions.auth.createAccount({
    userAgent: 'app-sdk',
    email: message.email,
    password: message.password,
  }));
}

function ACCOUNT_LOGOUT(
  store: Store,
  message: AccountLogoutMessage
) {
  store.dispatch(actions.auth.signOut());
}

export const messageHandlers = {
  ACCOUNT_LOGIN_PASSWORD,
  ACCOUNT_CREATE,
  ACCOUNT_LOGOUT,
};
