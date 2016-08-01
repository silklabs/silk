/**
 * Authentication actions
 *
 * Unfortunately due to the way that silk-api works, these actions
 * have side-effects. Namely, the API's accessToken property gets
 * mutated as we attempt to restore credentials from disk or sign in.
 *
 * @flow
 */

import invariant from 'assert';
import {handleActions} from 'redux-actions';
import createLog from 'silk-log';

import type {Config as ApiConfig} from 'silk-api';
import type {Action} from './action';

const log = createLog('app-sdk-auth');

type AuthOperationType =
    'AUTH_RESTORE'
  | 'AUTH_SIGNIN'
  | 'AUTH_CREATEACCOUNT'
  | 'AUTH_RESETPASSWORD'
  ;

export type AuthState = {
  /**
   * Whether or not we've attempted to restore the any saved credentials.
   */
  restoreAttempted: boolean;

  /**
   * The resulting error object, if authentication failed.
   */
  currentOperation: ?{
    type: AuthOperationType;
    inProgress: true;
  } | {
    type: AuthOperationType;
    inProgress: false;
    error: Error;
  },

  /**
   * Whether we're successfully authenticated.
   */
  isAuthenticated: boolean;
};

const initialState: AuthState = {
  restoreAttempted: false,
  currentOperation: null,
  isAuthenticated: false,
};

function handleAuthAction<T: AuthOperationType>(
  operationType: T,
  state: AuthState,
  action: Action<T, boolean>
): AuthState {
  invariant(!state.isAuthenticated);

  if (action.requested) {
    return {
      ...state,
      currentOperation: {
        type: operationType,
        inProgress: true,
      },
    };
  }

  if (!state.currentOperation ||
      state.currentOperation.type !== operationType ||
      !state.currentOperation.inProgress) {
    log.debug(
      'Ignoring invalid action, assuming operation was aborted',
      action
    );
    return state;
  }

  if (action.error) {
    return {
      ...state,
      isAuthenticated: false,
      currentOperation: {
        type: operationType,
        inProgress: false,
        error: action.payload,
      },
    };
  }

  const isAuthenticated = action.payload;
  let currentOperation = null;
  if (!isAuthenticated) {
    currentOperation = {
      type: operationType,
      inProgress: false,
      error: new Error('Invalid inputs for ' + operationType),
    };
  }

  return {
    ...state,
    currentOperation,
    isAuthenticated,
  };
}

function AUTH_RESTORE(
  state: AuthState,
  action: Action<'AUTH_RESTORE', boolean>
): AuthState {
  const newState = handleAuthAction('AUTH_RESTORE', state, action);
  if (newState === state) {
    return state;
  }
  if (!action.requested) {
    newState.restoreAttempted = true;
    if (!action.error) {
      // Not having persistent information to restore is not a failure.
      newState.currentOperation = null;
    }
  }
  return newState;
}

function AUTH_SIGNIN(
  state: AuthState,
  action: Action<'AUTH_SIGNIN', boolean>
): AuthState {
  return handleAuthAction('AUTH_SIGNIN', state, action);
}

function AUTH_CREATEACCOUNT(
  state: AuthState,
  action: Action<'AUTH_CREATEACCOUNT', boolean>
): AuthState {
  return handleAuthAction('AUTH_CREATEACCOUNT', state, action);
}

function AUTH_RESETPASSWORD(
  state: AuthState,
  action: Action<'AUTH_RESETPASSWORD', boolean>
): AuthState {
  return handleAuthAction('AUTH_RESETPASSWORD', state, action);
}

function AUTH_SIGNOUT(
  state: AuthState,
  action: Action<'AUTH_SIGNOUT', void>
): AuthState {
  invariant(!state.currentOperation);
  if (action.requested) {
    return state;
  }
  if (action.error) {
    // Not much we can do here. Pretend signing out worked.
  }
  return {
    ...state,
    isAuthenticated: false,
  };
}

function AUTH_ABORT_OPERATION(
  state: AuthState,
  action: Action<'AUTH_SIGNOUT', void>
): AuthState {
  invariant(state.currentOperation);
  invariant(state.currentOperation.inProgress);
  return {
    ...state,
    currentOperation: null,
  };
}

function AUTH_ACK_ERROR(
  state: AuthState,
  action: Action<'AUTH_SIGNOUT', void>
): AuthState {
  invariant(state.currentOperation);
  invariant(!state.currentOperation.inProgress);
  return {
    ...state,
    currentOperation: null,
  };
}

function API_CREATE(
  state: AuthState,
  action: Action<'API_CREATE', ApiConfig>
): AuthState {
  return {
    ...initialState,
  };
}

export const reducer = handleActions({
  AUTH_RESTORE,
  AUTH_RESETPASSWORD,
  AUTH_SIGNOUT,
  AUTH_SIGNIN,
  AUTH_CREATEACCOUNT,
  AUTH_ABORT_OPERATION,
  AUTH_ACK_ERROR,
  API_CREATE,
}, initialState);
