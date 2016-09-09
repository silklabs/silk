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

import type {Action} from './action';
import type {PathSubscriber} from './watch';

export type Store<S> = ReduxStore<S> & {
  subscribeToPath: (path: string, listener: PathSubscriber<S, *>) => (() => void);
};

export {combineReducers} from 'redux';
export {handleActions} from 'redux-actions';

export type Options = {
  initialState?: Object;
  additionalMiddleware?: Middleware | Array<Middleware>;
  logOptions?: Object;
};

const DEBUG = (global.__DEV__) || (process.env.NODE_ENV !== `production`);

const log = createLog(`redux`);

const defaultLogOptions = {
  level: {
    prevState: `verbose`,
    action: `info`,
    nextState: `verbose`,
    error: `error`,
  },
  logger: {
    ...log,
    log: (...args: Array<mixed>) => undefined,
  },
  actionTransformer: (action: Action<*, *, *>) => {
    const {type, error} = action;
    if (action.requested) {
      return {type, requested: true};
    }
    if (error) {
      return {type, error, payload: action.payload};
    }
    return {type, payload: action.payload};
  },
  colors: {
    title: false,
    prevState: false,
    action: false,
    nextState: false,
    error: false,
  },
  timestamp: false,
};

export default function createStore(
  reducers: ReducersMapObject = {},
  options?: Options = {},
): Store<*> {
  let {
    initialState,
    additionalMiddleware,
    logOptions,
  } = options;

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
    logOptions = {...defaultLogOptions, ...(logOptions || {})};

    // The logger must always be the last middleware in the chain.
    middleware.push(createReduxLogger(logOptions));
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
