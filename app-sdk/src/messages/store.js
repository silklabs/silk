/**
 * @flow
 */

import {applyMiddleware, createStore, combineReducers} from 'redux';
import thunk from 'redux-thunk';
import watch from 'redux-watch';
import createLog from 'silk-log';

import * as reducers from '../store/reducers';
import {reducer as messages} from './reducers';

import type {ApiState} from '../store/api';
import type {AuthState} from '../store/auth_reducers';
import type {DevicesState} from '../store/device_reducers';
import type {MessagesState} from './reducers';

export type State = {
  api: ApiState;
  auth: AuthState;
  devices: DevicesState;
  messages: MessagesState;
};

type PathSubscriber<T> = (newValue: T, oldValue: T, objectPath: string) => any;

export type Store = {
  getState: () => State;
  dispatch: (action: any) => any;
  subscribe: (listener: (() => any)) => (() => void);
  subscribeToPath: (path: string, listener: PathSubscriber<*>) => (() => void);
};

const log = createLog('app-sdk-store');

const logger = store => next => action => {
  log.debug('Action:', action);
  return next(action);
};

export default function createSDKStore(): Store {
  const reducer = combineReducers({...reducers, messages});
  const store = createStore(reducer, applyMiddleware(thunk, logger));

  return {
    ...store,
    subscribeToPath: (path, listener) => {
      const wrappedListener = watch(store.getState, path)(listener);
      return store.subscribe(wrappedListener);
    },
  };
}
