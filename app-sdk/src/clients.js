/**
 * @flow
 */

import invariant from 'assert';
import {actions} from 'silk-app-client';

import type {
  ClientRemoveMessage,
  ClientUserAgentSetMessage,
} from './incoming';
import type {SDKStore} from './store';

function CLIENT_REMOVE(
  store: SDKStore,
  message: ClientRemoveMessage
) {
  const {clientId} = message;
  invariant(clientId);

  const {clients} = store.getState();
  invariant(clients.has(clientId));

  store.dispatch(actions.clients.removeBegin(clientId));
}

function CLIENT_USERAGENT_SET(
  store: SDKStore,
  message: ClientUserAgentSetMessage
) {
  const {clientId, userAgent} = message;
  invariant(clientId);

  const {clients} = store.getState();
  invariant(clients.has(clientId));

  store.dispatch(actions.clients.setUserAgent({clientId, userAgent}));
}

export const messageHandlers = {
  CLIENT_REMOVE,
  CLIENT_USERAGENT_SET,
};

export function init(store: SDKStore) {
  store.subscribeToPath('clients', (clients, _, state) => {
    clients.forEach((clientInfo, clientId) => {
      if (!clientInfo.revoke) {
        return;
      }

      const {revokeMessage, serverStatus} = clientInfo.revoke;
      if (!revokeMessage) {
        return;
      }

      if (serverStatus !== 'pending') {
        return;
      }

      store.dispatch(actions.clients.removeFromServer(clientId));
      store.dispatch(actions.clients.removeFromDevices(clientId));
    });
  });
}
