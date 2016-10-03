/**
 * @flow
 */

import {
  applyMiddleware,
  createStore as createReduxStore,
  combineReducers,
} from 'redux';
import thunk from 'redux-thunk';

import watch from './watch';

import type {
  Middleware,
  ReducersMapObject,
  Store as ReduxStore,
} from 'redux';

import type {PathSubscriber} from './watch';

export type Store<S> = ReduxStore<S> & {
  subscribeToPath: (path: string, listener: PathSubscriber<S, *>) => (() => void);
};

export {combineReducers} from 'redux';
export {handleActions} from 'redux-actions';

export default function createStore(
  reducers: ReducersMapObject = {},
  additionalMiddlewares?: Array<Middleware> = [],
): Store<*> {
  const store = createReduxStore(
    combineReducers({...reducers}),
    applyMiddleware(thunk, ...additionalMiddlewares),
  );

  return {
    ...store,
    subscribeToPath: (path, listener) => {
      const wrappedListener = watch(store.getState, path, listener);
      return store.subscribe(wrappedListener);
    },
  };
}
