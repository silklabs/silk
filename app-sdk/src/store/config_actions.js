/**
 * @flow
 */

import invariant from 'assert';
import merge from 'lodash.merge';
import {AsyncStorage} from 'react-native';
import {
  actionFromPayload,
  actionFromAsyncPayloadGen,
} from 'silk-redux/action';

import type {Config, StateWithConfig} from './config_reducers';

const STORAGE_KEY = 'app.config';

function genRestoreUser(): Promise<Config> {
  return AsyncStorage.getItem(STORAGE_KEY)
    .then((value) => value ? JSON.parse(value) : {});
}

function genSetUser(
  state: StateWithConfig,
  input: $Shape<Config>
): Promise<Config> {
  invariant(state.config.user !== null);
  const newUser = merge({}, state.config.user, input);
  return AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newUser))
    .then(() => newUser);
}

export const setDefault = actionFromPayload('CONFIG_SET_DEFAULT');
export const restoreUser = actionFromAsyncPayloadGen('CONFIG_RESTORE_USER', genRestoreUser);
export const setUser = actionFromAsyncPayloadGen('CONFIG_SET_USER', genSetUser);
