/**
 * @flow
 */

import {NetInfo} from 'react-native';

import * as actions from '../store/actions';

import type {Store} from './store';

type ClientConnectionStatus =
    'NOT_CONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  ;
type ClientConnectionError =
    'SERVER_UNREACHABLE'
  ;

type ClientAuthStatus =
    'NOT_AUTHENTICATED'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED'
  ;

// TODO:
type ClientAuthError = string;

export type ClientStatusMessage = {
  type: 'CLIENT_STATUS';
  clientConnectionStatus: ClientConnectionStatus;
  clientConnectionError: ?ClientConnectionError;
  clientAuthStatus: ClientAuthStatus;
  clientAuthError: ?ClientAuthError;
};

export function initialize(store: Store) {
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
