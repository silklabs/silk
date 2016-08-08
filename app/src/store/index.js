/**
 * @flow
 */

import createStore from 'silk-app-sdk/src/store';

import {reducer as wifiConfig} from './wifi_reducers';

import type {Store, State} from 'silk-app-sdk/src/store';
import type {WifiConfigState} from './wifi_reducers';

export type AppState = State & {
  wifiConfig: WifiConfigState;
};
export type AppStore = Store<AppState>;

export default function createAppStore(): AppStore {
  return createStore({
    wifiConfig,
  });
}
