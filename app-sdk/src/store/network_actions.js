/**
 * @flow
 */

import invariant from 'assert';
import {actionFromAsyncPayloadGen} from 'silk-redux/action';

import type {StateWithApi} from './api';

// Payload generators

function genCanReachServer(
  state: StateWithApi
): Promise<bool> {
  const {api} = state;
  invariant(api);
  return api.canReachServer();
}

// Thunk actions

export const canReachServer = actionFromAsyncPayloadGen('NETWORK_SERVER_REACHABLE', genCanReachServer);
