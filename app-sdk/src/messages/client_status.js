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

function setupNetworkConnectivityHandlers(store: Store) {
  function checkNetworkConnectivity() {
    store.dispatch(actions.network.canReachServer());
  }
  NetInfo.isConnected.addEventListener('change', checkNetworkConnectivity);
  checkNetworkConnectivity();
}

export function initialize(store: Store) {
  store.dispatch(actions.api.create({
    metrics: {
      type: 'account',
      tags: {},
    },
  }));
  setupNetworkConnectivityHandlers(store);

  store.dispatch(actions.auth.restore());
}
