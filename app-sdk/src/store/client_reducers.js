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
import type {RemoveClientFromServerResult} from './client_actions';

export type ClientInfo = {
  info: ListClientsOutputClients;
  revoke: ?{
    revokeMessage: ?string;
    serverStatus: 'pending' | 'requesting' | 'error';
    peersNotified: boolean;
  };
};

export type ClientsState = Map<string, ClientInfo>;

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

    newState.set(publicKey, {
      info: client,
      revoke: null,
    });
  });

  return (newClient || oldKeys.size) ? newState : state;
}

function CLIENTS_REMOVE_BEGIN(
  state: ClientsState,
  action: Action<'CLIENTS_REMOVE_BEGIN', string, string>
): ClientsState {
  if (action.error) {
    // XXX How to handle this?
    return state;
  }

  const {input: clientId} = action;
  invariant(clientId);

  const clientInfo = state.get(clientId);
  invariant(clientInfo);

  const newState = new Map(state);

  if (action.requested) {
    newState.set(clientId, {
      ...clientInfo,
      revoke: {
        revokeMessage: null,
        serverStatus: 'pending',
        peersNotified: false,
      },
    });
  } else {
    invariant(clientInfo.revoke);
    invariant(!clientInfo.revoke.revokeMessage);
    const {payload: revokeMessage} = action;
    invariant(revokeMessage);
    newState.set(clientId, {
      ...clientInfo,
      revoke: {
        ...clientInfo.revoke,
        revokeMessage,
      },
    });
  }
  return newState;
}

function CLIENTS_REMOVE_DEVICES(
  state: ClientsState,
  action: Action<'CLIENTS_REMOVE_DEVICES', string, void>
): ClientsState {
  if (action.error) {
    // XXX How to handle this?
    return state;
  }

  const {input: clientId} = action;
  invariant(clientId);

  const clientInfo = state.get(clientId);
  if (!clientInfo) {
    return state;
  }

  invariant(clientInfo.revoke);
  invariant(clientInfo.revoke.revokeMessage);
  invariant(!clientInfo.revoke.peersNotified);

  const newState = new Map(state);
  newState.set(clientId, {
    ...clientInfo,
    revoke: {
      ...clientInfo.revoke,
      peersNotified: true,
    },
  });

  return newState;
}

function CLIENTS_REMOVE_SERVER(
  state: ClientsState,
  action: Action<'CLIENTS_REMOVE_SERVER', string, RemoveClientFromServerResult>
): ClientsState {
  const {input: clientId} = action;
  invariant(clientId);

  const clientInfo = state.get(clientId);
  if (!clientInfo) {
    return state;
  }

  invariant(clientInfo.revoke);
  invariant(clientInfo.revoke.revokeMessage);

  const newState = new Map(state);

  if (action.requested) {
    invariant(clientInfo.revoke.serverStatus === null);
    newState.set(clientId, {
      ...clientInfo,
      revoke: {
        ...clientInfo.revoke,
        serverStatus: 'requesting',
      },
    });
  } else if (action.error || !action.payload.success) {
    newState.set(clientId, {
      ...clientInfo,
      revoke: {
        ...clientInfo.revoke,
        serverStatus: 'error',
      },
    });
  } else {
    newState.delete(clientId);
  }

  return newState;
}

export const reducer = handleActions({
  AUTH_SIGNOUT,
  CLIENTS_LIST_FETCH,
  CLIENTS_REMOVE_BEGIN,
  CLIENTS_REMOVE_DEVICES,
  CLIENTS_REMOVE_SERVER,
}, createInitialState());
