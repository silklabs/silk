/**
 * @flow
 */

import {applyMiddleware, createStore, combineReducers} from 'redux';
import thunk from 'redux-thunk';
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

export type Store = {
  getState: () => State;
  dispatch: (action: any) => any;
  subscribe: (listener: (() => any)) => (() => void);
  subscribeWithState: (listener: ((currentState: State, previousState: ?State) => any)) => (() => void);
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

    // Provide an additional API that lets listener get previous and
    // current state of the store as arguments.
    subscribeWithState: (listener) => {
      let previousState = null;
      const wrappedListener = () => {
        const oldState = previousState;
        previousState = store.getState();
        listener(previousState, oldState);
      };
      return store.subscribe(wrappedListener);
    },
  };
}
