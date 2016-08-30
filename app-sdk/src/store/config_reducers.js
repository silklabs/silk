/**
 * @flow
 */

import invariant from 'assert';
import merge from 'lodash.merge';
import {handleActions} from 'redux-actions';

import type {SimpleAction, Action} from 'silk-redux/action';

export type Config = {
  debug: string;
  serverUrl?: string;
  showServerPicker?: boolean;
  showDevServers?: boolean;
  defaultEmail?: string;
  defaultPassword?: string;
  [key: string]: any;
};

export type ConfigState = {
  default: ?Config;
  user: ?Config;
  current: ?Config;
};

export type StateWithConfig = {
  config: ConfigState;
};

const initialState: ConfigState = {
  default: null,
  user: null,
  current: null,
};

function CONFIG_SET_DEFAULT(
  state: ConfigState,
  action: SimpleAction<'CONFIG_SET_DEFAULT', Config>
): ConfigState {
  invariant(state.default === null);
  invariant(state.user === null);
  invariant(state.current === null);
  invariant(!action.requested);
  invariant(!action.error);
  return {
    ...state,
    default: action.payload,
    current: {...action.payload},
  };
}

function CONFIG_SET_USER(
  state: ConfigState,
  action: Action<'CONFIG_RESTORE_USER' | 'CONFIG_SET_USER', *, Config>
): ConfigState {
  if (action.requested || action.error) {
    return state;
  }
  return {
    ...state,
    user: action.payload,
    current: merge({}, state.default, action.payload),
  };
}

export const reducer = handleActions({
  CONFIG_SET_DEFAULT,
  CONFIG_RESTORE_USER: CONFIG_SET_USER,
  CONFIG_SET_USER,
}, initialState);
