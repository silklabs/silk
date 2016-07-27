/**
 * @flow
 */

import {applyMiddleware, createStore, combineReducers} from 'redux';
import thunk from 'redux-thunk';
import watch from 'redux-watch';
import createLog from 'silk-log';

import * as builtinReducers from './reducers';

export type {State} from './reducers';

type PathSubscriber<T> = (newValue: T, oldValue: T, objectPath: string) => any;

export type Store<S> = {
  getState: () => S;
  dispatch: (action: any) => any;
  subscribe: (listener: (() => any)) => (() => void);
  subscribeToPath: (path: string, listener: PathSubscriber<*>) => (() => void);
};

type ReducerMap = {
  // Wish we could type that better.
  [name: string]: (state: any, action: any) => any;
};

const log = createLog('app-sdk-store');

const logger = store => next => action => {
  log.debug('Action:', action);
  return next(action);
};

export default function makeStore(
  additionalReducers: ReducerMap = {}
): Store<*> {
  const reducer = combineReducers({...builtinReducers, ...additionalReducers});
  const store = createStore(reducer, applyMiddleware(thunk, logger));

  return {
    ...store,
    subscribeToPath: (path, listener) => {
      const wrappedListener = watch(store.getState, path)(listener);
      return store.subscribe(wrappedListener);
    },
  };
}
