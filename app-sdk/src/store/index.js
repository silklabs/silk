/**
 * @flow
 */

import createStore from 'silk-redux';

import * as builtinReducers from './reducers';

import type {ReducersMapObject} from 'redux';
import type {Store} from 'silk-redux';

export type {
  State,
  ApiState,
  AuthState,
  ConfigState,
  DevicesState,
  NetworkState,
} from './reducers';

export type {Store} from 'silk-redux';

export default function makeStore(
  additionalReducers: ReducersMapObject = {}
): Store<*> {
  return createStore({...builtinReducers, ...additionalReducers});
}
