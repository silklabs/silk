/**
 * @flow
 */

import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import createLog from 'silk-log';

import wifiConfig from '../reducers/wifi';

const log = createLog('store-wifi');

const logger = store => next => action => {
  log.debug('Action:', action.type);
  return next(action);
};

const createThunkStore = applyMiddleware(thunk, logger)(createStore);
const store = createThunkStore(wifiConfig);
export default store;
