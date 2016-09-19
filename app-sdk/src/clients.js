/**
 * @flow
 */

import invariant from 'assert';
import {actions} from 'silk-app-client';

import type {ClientsRemoveMessage} from './incoming';
import type {SDKStore} from './store';

function CLIENTS_REMOVE(
  store: SDKStore,
  message: ClientsRemoveMessage
) {
  const {clientId} = message;
  invariant(clientId);

  const {clients} = store.getState();
  invariant(clients.has(clientId));

  store.dispatch(actions.clients.removeBegin(clientId));
}

export const messageHandlers = {
  CLIENTS_REMOVE,
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
