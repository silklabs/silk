/**
 * Client actions
 *
 * @flow
 */

import invariant from 'assert';
import {AccessToken} from 'silk-api';
import * as onion from 'silk-onion';
import {
  actionFromPayloadGen,
  actionFromAsyncPayloadGen,
} from 'silk-redux/action';

import type {ListClientsOutput} from 'silk-api/src/gen/account';
import type {StateWithApi} from './api';
import type {State} from './reducers';

export type RemoveClientFromServerResult = {
  clientId: string;
  success: boolean;
};

export type SetUserAgentInput = {
  clientId: string;
  userAgent: string;
};

export type SetUserAgentResult = {
  clientId: string;
  success: boolean;
};

// Payload generators

function genFetchList(
  state: StateWithApi
): Promise<ListClientsOutput> {
  const {api} = state;
  invariant(api);

  return api.account.listClients({});
}

function genRemoveBegin(
  state: State,
  input: string,
): Promise<string> {
  const {api, clients} = state;
  invariant(api);

  const {accessToken} = api;
  invariant(accessToken);

  const clientInfo = clients.get(input);
  invariant(clientInfo);
  invariant(!clientInfo.revoke);

  return onion.genEncode({
    senderIdentity: accessToken,
    recipientIdentity: AccessToken.importPub(input),
    channel: 'http',
    payload: {
      name: 'revoke-client',
      clientId: input,
    },
  }).then((buffer) => buffer.toString('base64'));
}

function removeDevices(state: State, input: string): void {
  const {clients, devices} = state;
  invariant(clients);
  invariant(devices);

  const clientInfo = clients.get(input);
  invariant(clientInfo);
  invariant(clientInfo.revoke);

  const {revokeMessage: message} = clientInfo.revoke;
  invariant(message);

  const {registered} = devices;
  if (!registered) {
    return;
  }

  const channelName = 'system';

  registered.forEach((device) => {
    const {peer} = device.rtc;
    if (!peer) {
      return;
    }

    const channel = peer.createChannel(channelName);
    channel.emit(channelName, {message});
  });
}

function genRemoveServer(
  state: State,
  input: string
): Promise<RemoveClientFromServerResult> {
  const {api, clients} = state;
  invariant(api);
  invariant(clients);

  const {accessToken} = api;
  invariant(accessToken);

  const clientInfo = clients.get(input);
  invariant(clientInfo);
  invariant(clientInfo.revoke);

  const {revokeMessage} = clientInfo.revoke;
  invariant(revokeMessage);

  return api.account.revokeClient({
    clientPublicKey: input,
    revokeClientMessageForDevices: revokeMessage,
  }).then((result) => ({
    clientId: input,
    success: result.success,
  }));
}

function genSetUserAgent(
  state: State,
  input: SetUserAgentInput
): Promise<SetUserAgentResult> {
  const {clientId, userAgent} = input;
  invariant(clientId);

  const {api, clients} = state;
  invariant(api);
  invariant(clients);

  const {accessToken} = api;
  invariant(accessToken);

  const clientInfo = clients.get(clientId);
  invariant(clientInfo);

  return api.account.setClientUserAgent({
    clientPublicKey: clientId,
    userAgent,
  }).then((result) => ({
    clientId,
    success: result.success,
  }));
}

// ThunkActions

export const fetchList = actionFromAsyncPayloadGen('CLIENT_LIST_FETCH', genFetchList);
export const removeBegin = actionFromAsyncPayloadGen('CLIENT_REMOVE_BEGIN', genRemoveBegin);
export const removeFromDevices = actionFromPayloadGen('CLIENT_REMOVE_DEVICES', removeDevices);
export const removeFromServer = actionFromAsyncPayloadGen('CLIENT_REMOVE_SERVER', genRemoveServer);
export const setUserAgent = actionFromAsyncPayloadGen('CLIENT_USERAGENT_SET', genSetUserAgent);
