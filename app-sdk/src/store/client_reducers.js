/**
 * Client reducers
 *
 * @flow
 */

import invariant from 'assert';
import {handleActions} from 'redux-actions';

import type {
  ListClientsOutput,
  ListClientsOutputClients,
} from 'silk-api/src/gen/account';
import type {Action} from 'silk-redux/action';

export type ClientsState = Map<string, ListClientsOutputClients>;

function createInitialState(): ClientsState {
  return new Map();
}

function AUTH_SIGNOUT(
  state: ClientsState,
  action: Action<'AUTH_SIGNOUT', void, boolean>
): ClientsState {
  return createInitialState();
}

function CLIENTS_LIST_FETCH(
  state: ClientsState,
  action: Action<'CLIENTS_LIST_FETCH', void, ListClientsOutput>
): ClientsState {
  if (action.requested) {
    return state;
  }
  if (action.error) {
    // Not much we can do here...
    return state;
  }

  const {clients} = action.payload;
  invariant(clients);
  invariant(Array.isArray(clients));

  let newClient = false;

  const oldKeys = new Set(state.keys());
  const newState = new Map();

  clients.forEach((client) => {
    const {publicKey} = client;

    if (oldKeys.has(publicKey)) {
      oldKeys.delete(publicKey);
    } else {
      newClient = true;
    }

    newState.set(publicKey, client);
  });

  return (newClient || oldKeys.size) ? newState : state;
}

export const reducer = handleActions({
  AUTH_SIGNOUT,
  CLIENTS_LIST_FETCH,
}, createInitialState());
