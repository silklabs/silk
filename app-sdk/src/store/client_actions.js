/**
 * Client actions
 *
 * @flow
 */

import invariant from 'assert';
import {actionFromAsyncPayloadGen} from 'silk-redux/action';

import type {ListClientsOutput} from 'silk-api/src/gen/account';
import type {StateWithApi} from './api';


// Payload generators

function genFetchList(
  state: StateWithApi
): Promise<ListClientsOutput> {
  const {api} = state;
  invariant(api);

  return api.account.listClients({});
}

// ThunkActions

export const fetchList = actionFromAsyncPayloadGen('CLIENTS_LIST_FETCH', genFetchList);
