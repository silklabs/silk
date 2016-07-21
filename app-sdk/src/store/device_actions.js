/**
 * @flow
 */

import invariant from 'assert';
import {AsyncStorage} from 'react-native';

import {actionFromAsyncPayloadGen} from './action';

import type {ListDevicesOutput} from 'silk-api/src/gen/account';

import type {StateWithApi} from './api';

const REGISTERED_DEVICES_KEY = 'user.registeredDevices';

// Payload generators

function genRestoreDeviceList(
  state: StateWithApi
): Promise<?ListDevicesOutput> {
  return AsyncStorage.getItem(REGISTERED_DEVICES_KEY)
    .then((result) => result ? JSON.parse(result) : null);
}

async function genFetchDeviceList(
  state: StateWithApi
): Promise<ListDevicesOutput> {
  const {api} = state;
  invariant(api);
  const result = await api.account.listDevices({});
  await AsyncStorage.setItem(REGISTERED_DEVICES_KEY, JSON.stringify(result));
  return result;
}

// Thunk actions

export const restoreDeviceList = actionFromAsyncPayloadGen('DEVICE_LIST_RESTORE', genRestoreDeviceList);
export const fetchDeviceList = actionFromAsyncPayloadGen('DEVICE_LIST_FETCH', genFetchDeviceList);
