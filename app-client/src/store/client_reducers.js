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
import type {
  RemoveClientFromServerResult,
  SetUserAgentInput,
  SetUserAgentResult,
} from './client_actions';

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

function CLIENT_LIST_FETCH(
  state: ClientsState,
  action: Action<'CLIENT_LIST_FETCH', void, ListClientsOutput>
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

function CLIENT_REMOVE_BEGIN(
  state: ClientsState,
  action: Action<'CLIENT_REMOVE_BEGIN', string, string>
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

function CLIENT_REMOVE_DEVICES(
  state: ClientsState,
  action: Action<'CLIENT_REMOVE_DEVICES', string, void>
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

function CLIENT_REMOVE_SERVER(
  state: ClientsState,
  action: Action<'CLIENT_REMOVE_SERVER', string, RemoveClientFromServerResult>
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
    invariant(clientInfo.revoke.serverStatus === 'pending');
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


function CLIENT_USERAGENT_SET(
  state: ClientsState,
  action: Action<'CLIENT_USERAGENT_SET', SetUserAgentInput, SetUserAgentResult>
): ClientsState {
  if (action.requested) {
    return state;
  }

  if (action.error) {
    // Not much we can do here...
    return state;
  }

  const {clientId, userAgent} = action.input;
  invariant(clientId);

  const oldClient = state.get(clientId);
  if (!oldClient) {
    return state;
  }

  const newState = new Map(state);
  newState.set(clientId, {
    ...oldClient,
    userAgent,
  });

  return newState;
}

export const reducer = handleActions({
  AUTH_SIGNOUT,
  CLIENT_LIST_FETCH,
  CLIENT_REMOVE_BEGIN,
  CLIENT_REMOVE_DEVICES,
  CLIENT_REMOVE_SERVER,
  CLIENT_USERAGENT_SET,
}, createInitialState());
