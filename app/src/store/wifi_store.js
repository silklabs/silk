/**
 * @flow
 */

import {applyMiddleware, createStore} from 'redux';
import thunk from 'redux-thunk';
import createLog from 'silk-log';

import {reducer} from './wifi_reducers';

const log = createLog('store-wifi');

const logger = store => next => action => {
  log.debug('Action:', action);
  return next(action);
};

const store = createStore(reducer, applyMiddleware(thunk, logger));
export default store;
