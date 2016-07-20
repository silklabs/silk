/**
 * Authentication actions
 *
 * Unfortunately due to the way that silk-api works, these actions
 * have side-effects. Namely, the API's accessToken property gets
 * mutated as we attempt to restore credentials from disk or sign in.
 *
 * @flow
 */
import {handleActions} from 'redux-actions';

import type {Action} from './action';

export type AuthState = {
  /**
   * Whether or not we've attempted to restore the any saved credentials.
   */
  restoreAttempted: boolean;

  /**
   * Whether we're in the process of authenticating right now.
   */
  inProgress: boolean;

  /**
   * The resulting error object, if authentication failed.
   */
  error: ?Error,

  /**
   * Whether we're successfully authenticated.
   */
  authenticated: boolean;
};

const initialState: AuthState = {
  restoreAttempted: false,
  inProgress: false,
  error: null,
  authenticated: false,
};

function AUTH_RESTORE(
  state: AuthState,
  action: Action<'AUTH_RESTORE', boolean>
): AuthState {
  if (action.requested) {
    return state;
  }
  if (action.error) {
    // If restoring failed, we just want to drop the error on the
    // floor. There's no point in presenting it to the user. They'll
    // have to log in again anyway.
    return {
      ...state,
      restoreAttempted: true,
      authenticated: false,
    };
  }
  return {
    ...state,
    restoreAttempted: true,
    inProgress: false,
    authenticated: action.payload,
    error: null,
  };
}

function AUTH_SIGNOUT(
  state: AuthState,
  action: Action<'AUTH_SIGNOUT', boolean>
): AuthState {
  if (action.requested) {
    return state;
  }
  if (action.error) {
    // Not much we can do here. Pretend signing out worked.
  }
  return {
    ...state,
    authenticated: false,
  };
}

function AUTH_SIGNIN(
  state: AuthState,
  action: Action<'AUTH_SIGNIN', boolean>
): AuthState {
  if (action.requested) {
    return {
      ...state,
      error: null,
      inProgress: true,
    };
  }
  if (action.error) {
    return {
      ...state,
      error: action.payload,
    };
  }
  return {
    ...state,
    error: null,
    authenticated: action.payload,
  };
}

function AUTH_CREATEACCOUNT(
  state: AuthState,
  action: Action<'AUTH_CREATEACCOUNT', boolean>
): AuthState {
  if (action.requested) {
    return state;
  }
  if (action.error) {
    return {
      ...state,
      error: action.payload,
    };
  }
  return {
    ...state,
    error: null,
    authenticated: action.payload,
  };
}

export const reducer = handleActions({
  AUTH_RESTORE,
  AUTH_SIGNOUT,
  AUTH_SIGNIN,
  AUTH_CREATEACCOUNT,
}, initialState);
