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
import type {Action, SimpleAction} from 'silk-redux/action';

import type {Config as ApiConfig} from 'silk-api';

const log = createLog('app-sdk-auth');

type AuthOperationType =
    'AUTH_RESTORE'
  | 'AUTH_SIGNIN_WITH_PASSWORD'
  | 'AUTH_SIGNIN_WITH_TOKEN'
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

  /**
   * The UUID for the account beacon when `isAuthenticated` is true. Null when
   * `isAuthenticated` is false.
   */
  beaconUuid: ?string;
};

const initialState: AuthState = {
  restoreAttempted: false,
  currentOperation: null,
  isAuthenticated: false,
  beaconUuid: null,
};

function handleAuthAction<T: AuthOperationType>(
  operationType: T,
  state: AuthState,
  action: Action<T, *, ?string>
): AuthState {
  invariant(!state.isAuthenticated);
  invariant(state.beaconUuid === null);

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
      beaconUuid: null,
      currentOperation: {
        type: operationType,
        inProgress: false,
        error: action.payload,
      },
    };
  }

  const beaconUuid = action.payload;
  const isAuthenticated = beaconUuid !== null;
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
    beaconUuid,
  };
}

function AUTH_RESTORE(
  state: AuthState,
  action: Action<'AUTH_RESTORE', void, ?string>
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

function AUTH_SIGNIN_WITH_PASSWORD(
  state: AuthState,
  action: Action<'AUTH_SIGNIN_WITH_PASSWORD', *, ?string>
): AuthState {
  return handleAuthAction('AUTH_SIGNIN_WITH_PASSWORD', state, action);
}

function AUTH_SIGNIN_WITH_TOKEN(
    state: AuthState,
    action: Action<'AUTH_SIGNIN_WITH_TOKEN', *, ?string>
): AuthState {
  return handleAuthAction('AUTH_SIGNIN_WITH_TOKEN', state, action);
}

function AUTH_CREATEACCOUNT(
  state: AuthState,
  action: Action<'AUTH_CREATEACCOUNT', *, ?string>
): AuthState {
  return handleAuthAction('AUTH_CREATEACCOUNT', state, action);
}

function AUTH_RESETPASSWORD(
  state: AuthState,
  action: Action<'AUTH_RESETPASSWORD', *, ?string>
): AuthState {
  return handleAuthAction('AUTH_RESETPASSWORD', state, action);
}

function AUTH_SIGNOUT(
  state: AuthState,
  action: Action<'AUTH_SIGNOUT', void, void>
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
    beaconUuid: null,
  };
}

function AUTH_ABORT_OPERATION(
  state: AuthState,
  action: SimpleAction<'AUTH_SIGNOUT', void>
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
  action: SimpleAction<'AUTH_SIGNOUT', void>
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
  action: Action<'API_CREATE', *, ApiConfig>
): AuthState {
  return {
    ...initialState,
  };
}

export const reducer = handleActions({
  AUTH_RESTORE,
  AUTH_RESETPASSWORD,
  AUTH_SIGNOUT,
  AUTH_SIGNIN_WITH_PASSWORD,
  AUTH_SIGNIN_WITH_TOKEN,
  AUTH_CREATEACCOUNT,
  AUTH_ABORT_OPERATION,
  AUTH_ACK_ERROR,
  API_CREATE,
}, initialState);
