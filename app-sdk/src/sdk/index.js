/**
 * Main entry point for the App SDK.
 *
 * @flow
 */

import 'silk-react-native-transformer/globals';
import defaultConfig from './config';

import * as dispatch from './dispatch';
import * as clients from './clients';
import * as devices from './devices';
import createStore from './store';
import * as client from '../client';
import * as actions from '../store/actions';

const store = createStore();
client.init(store);
clients.init(store);
dispatch.init(store);
devices.init(store);
process.nextTick(() => {
  store.dispatch(actions.config.setDefault(defaultConfig));
  store.dispatch(actions.config.restoreUser());
});
