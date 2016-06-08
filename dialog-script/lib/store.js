/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import {createStore, applyMiddleware} from 'redux';
import createReduxLogger from 'redux-logger';
import createSagaMiddleware from 'redux-saga';

import reducer from './reducers';

// TODO: Load from disk.
//const initialState = null;

const sagaMiddleware = createSagaMiddleware();

const middleware = [sagaMiddleware];

if (process.env.NODE_ENV !== 'production') {
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

const store = createStore(
  reducer,
  /* initialState, */
  applyMiddleware(...middleware)
);
store.runSaga = sagaMiddleware.run;

export default store;
