/**
 * @flow
 */

import invariant from 'assert';
import {handleActions} from 'redux-actions';

import type {Action} from 'silk-redux/action';

export type NetworkState = {
  canReachServer: boolean;
};

const initialState: NetworkState = {
  // Assume that we can reach the server initially to avoid flickering the UI
  // on every launch.
  canReachServer: true,
};

function NETWORK_SERVER_REACHABLE(
  state: NetworkState,
  action: Action<'NETWORK_SERVER_REACHABLE', void, boolean>
): NetworkState {
  // canReachServer() should never throw. If it does, it's a bug.
  invariant(!action.error);

  if (action.requested) {
    return state;
  }
  return {
    canReachServer: action.payload,
  };
}

export const reducer = handleActions({
  NETWORK_SERVER_REACHABLE,
}, initialState);
