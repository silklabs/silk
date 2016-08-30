/**
 * Simple action + reducer machinery to inject the SilkApi object
 * into the redux state.
 *
 * @flow
 */

import {handleActions} from 'redux-actions';
import createApi from 'silk-api';
import {actionFromPayload} from 'silk-redux/action';

import type {SilkApi, Config as ApiConfig} from 'silk-api';
import type {SimpleAction} from 'silk-redux/action';

// Actions

export const create = actionFromPayload('API_CREATE');

// Reducers

export type ApiState = ?SilkApi;
export type StateWithApi = {api: ApiState};

function API_CREATE(
  state: ApiState,
  action: SimpleAction<'API_CREATE', ApiConfig>
): ApiState {
  return createApi(action.payload);
}

const initialState: ApiState = null;
export const reducer = handleActions({
  API_CREATE,
}, initialState);
