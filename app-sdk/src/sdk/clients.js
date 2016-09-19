/**
 * @flow
 */

import invariant from 'assert';
import {clients as actions} from '../store/actions';

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

  store.dispatch(actions.removeBegin(clientId));
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

      store.dispatch(actions.removeFromServer(clientId));
      store.dispatch(actions.removeFromDevices(clientId));
    });
  });
}
