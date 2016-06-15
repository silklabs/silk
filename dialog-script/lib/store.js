/**
 * @flow
 */

import {
  createStore as createReduxStore,
  applyMiddleware,
} from 'redux';
import createReduxLogger from 'redux-logger';
import createSagaMiddleware from 'redux-saga';
import storage from 'silk-dialog-storage';

// $FlowFixMe: No idea why but Flow can't see this module.
import immutableStateInvariantMiddleware from 'redux-immutable-state-invariant';

import reducer from './reducers';

let storePromise: ?Promise<Object> = null;

export default function getOrCreateStore(): Promise<Object> {
  if (storePromise) {
    return storePromise;
  }

  storePromise = storage.get().then((initialState) => {

    if (initialState) {
      // XXX This is a good indication that we shouldn't persist these.
      initialState.speaking = null;
      initialState.intepreting = false;
    }

    // This middleware runs all of our saga machinery.
    const sagaMiddleware = createSagaMiddleware();

    const middleware = [sagaMiddleware];

    /**
     * We want all redux state changes to be logged in debug builds (but not in
     * production builds).
     */
    if (process.env.NODE_ENV !== 'production') {
      // XXX The invariant middleware should be the first in the chain.
      middleware.unshift(immutableStateInvariantMiddleware());

      if (process.env.REDUX_LOGGING !== 'false') {
        // XXX The logger must always be the last middleware in the chain.
        middleware.push(createReduxLogger({
          colors: {
            title: false,
            prevState: false,
            action: false,
            nextState: false,
            error: false,
          },
        }));
      }
    }

    // Tell redux to create our one and only data store.
    const store = createReduxStore(
      reducer,
      initialState,
      applyMiddleware(...middleware)
    );
    store.runSaga = sagaMiddleware.run;
    return store;
  });

  return storePromise;
}
