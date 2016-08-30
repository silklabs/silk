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
import watch from 'redux-watch';
import createLog from 'silk-log';

import type {
  Middleware,
  ReducersMapObject,
  Store as ReduxStore,
} from 'redux';

type PathSubscriber<T> = (newValue: T, oldValue: T, objectPath: string) => any;

export type Store<S> = ReduxStore & {
  subscribeToPath: (path: string, listener: PathSubscriber<*>) => (() => void);
};

const DEBUG = (global.__DEV__) || (process.env.NODE_ENV !== `production`);

const log = createLog(`redux-store`);

export default function createStore(
  reducers: ReducersMapObject = {},
  initialState?: ?Object = undefined,
  additionalMiddleware?: ?Middleware | ?Array<Middleware> = undefined,
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
    middleware.push(createReduxLogger({
      level: {
        prevState: `debug`,
        action: `debug`,
        nextState: `debug`,
        error: `error`,
      },
      logger: {
        ...log,
        log: (...args: Array<any>) => log.info(...args),
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
        // Stupid heuristic to get the most informative but least spammy
        // log messages from actions.
        if ((typeof payload === `object`) &&
            (payload !== null) &&
            (!payload.constructor || payload.constructor.name !== `Object`)) {
          payload = `<${payload.constructor.name}>`;
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
      const wrappedListener = watch(store.getState, path)(listener);
      return store.subscribe(wrappedListener);
    },
  };
}
