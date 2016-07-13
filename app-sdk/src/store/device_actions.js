/**
 * @flow
 */

import invariant from 'assert';

import {actionFromAsyncPayloadGen} from './action';

import type {ListDevicesOutput} from 'silk-api/src/gen/account';

import type {StateWithApi} from './api';

// Payload generators

function genFetchDeviceList(
  state: StateWithApi
): Promise<ListDevicesOutput> {
  const {api} = state;
  invariant(api);
  return api.account.listDevices({});
}

// Thunk actions

export const fetchDeviceList = actionFromAsyncPayloadGen('DEVICE_LIST_FETCH', genFetchDeviceList);
