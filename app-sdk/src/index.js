/**
 * @flow
 */

import 'silk-react-native-transformer/globals';
import defaultConfig from './config';

import createStore from './messages/store';
import * as client from './client';
import * as dispatch from './messages/dispatch';
import * as actions from './store/actions';

const store = createStore();
client.init(store);
dispatch.init(store);
process.nextTick(() => {
  store.dispatch(actions.config.setDefault(defaultConfig));
});
