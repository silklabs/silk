/**
 * @flow
 */

import {NetInfo} from 'react-native';

import * as actions from './store/actions';

import type {Store} from './store';

function initNetworkAndAPI(store: Store<*>) {
  let networkConnectivitySubscription = null;
  function checkNetworkConnectivity() {
    store.dispatch(actions.network.canReachServer());
  }

  store.subscribeToPath('config.current', (config, oldConfig) => {
    if (oldConfig && config.serverUrl === oldConfig.serverUrl) {
      return;
    }
    store.dispatch(actions.api.create({
      serverUrl: config.serverUrl,
      metrics: {
        type: 'account',
        tags: {},
      },
    }));
    store.dispatch(actions.auth.restore());

    if (networkConnectivitySubscription === null) {
      networkConnectivitySubscription = NetInfo.isConnected.addEventListener(
        'change',
        checkNetworkConnectivity
      );
    }
    checkNetworkConnectivity();
  });
}

function initDevices(store: Store<*>) {
  store.subscribeToPath('auth.isAuthenticated', (isAuthenticated) => {
    if (isAuthenticated) {
      store.dispatch(actions.devices.fetchDeviceList());
    }
  });
}

export function init(store: Store<*>) {
  initNetworkAndAPI(store);
  initDevices(store);
}
