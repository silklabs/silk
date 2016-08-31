/**
 * @flow
 */

import {
  applyMiddleware,
  createStore as createReduxStore,
  combineReducers,
} from 'redux';
import createReduxLogger from 'redux-logger';
import thunk from 'redux-thunk';
import createLog from 'silk-log';

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

const DEBUG = (global.__DEV__) || (process.env.NODE_ENV !== `production`);

const log = createLog(`redux`);

export default function createStore(
  reducers: ReducersMapObject = {},
  initialState?: ?Object = undefined,
  additionalMiddleware?: ?Middleware | ?Array<Middleware> = undefined,
  logOptions?: ?Object = undefined,
): Store<*> {
  const middleware = [thunk];
  if (additionalMiddleware) {
    if (Array.isArray(additionalMiddleware)) {
      middleware.push(...additionalMiddleware);
    } else {
      middleware.push(additionalMiddleware);
    }
  }

  // We want all redux state changes to be logged in debug builds.
  if (DEBUG) {
    // The logger must always be the last middleware in the chain.
    middleware.push(createReduxLogger(logOptions || {
      level: {
        prevState: `verbose`,
        action: `info`,
        nextState: `verbose`,
        error: `error`,
      },
      logger: {
        ...log,
        log: (...args: Array<any>) => undefined,
      },
      actionTransformer: (action: any) => {
        const {type, requested, error} = action;
        let {payload} = action;
        if (requested) {
          return {type, requested};
        }
        if (error) {
          return {type, error, payload};
        }
        return {type, payload};
      },
      colors: {
        title: false,
        prevState: false,
        action: false,
        nextState: false,
        error: false,
      },
      timestamp: false,
    }));
  }

  const store = createReduxStore(
    combineReducers({...reducers}),
    initialState,
    applyMiddleware(...middleware),
  );

  return {
    ...store,
    subscribeToPath: (path, listener) => {
      const wrappedListener = watch(store.getState, path, listener);
      return store.subscribe(wrappedListener);
    },
  };
}
