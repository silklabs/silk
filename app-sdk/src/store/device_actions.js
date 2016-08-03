/**
 * @flow
 */

import invariant from 'assert';
import {AsyncStorage, NativeModules} from 'react-native';
import createLog from 'silk-log';

import {
  actionFromAsyncPayloadGen,
  actionFromPayload,
} from './action';

import type {
  ListDevicesOutput,
  UnregisterDeviceInput,
} from 'silk-api/src/gen/account';

import type {
  DeviceSecret,
  DeviceStatus,
} from '../ble/device_manager';
import type {StateWithApi} from './api';

export type UnregisterRegisteredDeviceResult = {
  deviceId: string;
  success: boolean;
};

export type ConfiguringDeviceProximityGate = {
  socketId: number;
  secret: DeviceSecret;
};

export type ConfiguringDeviceStatusUpdate = {
  socketId: number;
  status: DeviceStatus;
};

export type ConfiguringDeviceError = {
  socketId: number;
  error: Error;
};

export type RegisterConfiguringDeviceInput = {
  devicePublicKey: string;
  type: string;
  name: string;
};

export type RegisterConfiguringDeviceResult = {
  success: bool;
  type: string;
  name: string;
  beaconUUID: ?string;
  registrationToken: string;
};

const log = createLog('app-sdk-device-actions');
const REGISTERED_DEVICES_KEY = 'user.registeredDevices';

// Payload generators

function genRestoreRegisteredDeviceList(
  state: StateWithApi
): Promise<?ListDevicesOutput> {
  return AsyncStorage.getItem(REGISTERED_DEVICES_KEY)
    .then((result) => result ? JSON.parse(result) : null);
}

function genFetchRegisteredDeviceList(
  state: StateWithApi
): Promise<ListDevicesOutput> {
  const {api} = state;
  invariant(api);
  return api.account.listDevices({});
}

function genUnregisterRegisteredDevice(
  state: StateWithApi,
  input: UnregisterDeviceInput
): Promise<UnregisterRegisteredDeviceResult> {
  const {api} = state;
  invariant(api);
  return api.account.unregisterDevice(input).then((result) => ({
    deviceId: input.devicePublicKey,
    success: result.success,
  }));
}

async function genRegisterConfiguringDeviceWithServer(
  state: StateWithApi,
  input: RegisterConfiguringDeviceInput
): Promise<RegisterConfiguringDeviceResult> {
  const {api} = state;
  invariant(api);

  const {devicePublicKey} = input;
  log.info('Registering device', devicePublicKey);

  // Ugh, we're signing a hex string, which will be hashed as a
  // string before actually being signed.
  invariant(api.accessToken);
  const registrationToken = await api.accessToken.genSign(devicePublicKey);

  const {
    success,
    beaconUUID,
  } = await api.account.registerDevice({
    ...input,
    registrationToken,
  });

  if (success) {
    log.info(`Successfully registered device`);
    // TODO: enable this once we have the BLE code in the SDK.
    // Even better, move this to a store subscriber so these actions
    // don't have any side-effects.
    if (NativeModules.BLESocketManager) {
      NativeModules.BLESocketManager.addBeaconUuid(beaconUUID);
    }
  } else {
    log.warn(`Failed to register device with the server...`);
  }

  return {
    ...input,
    success,
    registrationToken,
    beaconUUID,
  };
}

// Thunk Actions

export const registered = {
  restoreList: actionFromAsyncPayloadGen('DEVICE_REGISTERED_RESTORE', genRestoreRegisteredDeviceList),
  fetchList: actionFromAsyncPayloadGen('DEVICE_REGISTERED_FETCH', genFetchRegisteredDeviceList),
  unregister: actionFromAsyncPayloadGen('DEVICE_REGISTERED_UNREGISTER', genUnregisterRegisteredDevice),
};

// Actions
//
// Most of these are meant to be fed from events emitted by the BLE
// DeviceSession.

export const unregistered = {
  connected: actionFromPayload('DEVICE_UNREGISTERED_CONNECTED'),
  disconnected: actionFromPayload('DEVICE_UNREGISTERED_DISCONNECTED'),
  accepted: actionFromPayload('DEVICE_UNREGISTERED_ACCEPTED'),
  declined: actionFromPayload('DEVICE_UNREGISTERED_DECLINED'),
};

export const configuring = {
  aborted: actionFromPayload('DEVICE_CONFIGURING_ABORTED'),
  passedProximity: actionFromPayload('DEVICE_CONFIGURING_PROXIMITYGATE'),
  statusUpdated: actionFromPayload('DEVICE_CONFIGURING_STATUSUPDATED'),
  registerWithServer: actionFromAsyncPayloadGen('DEVICE_CONFIGURING_REGISTERSERVER', genRegisterConfiguringDeviceWithServer),
  registered: actionFromPayload('DEVICE_CONFIGURING_REGISTERED'),
  error: actionFromPayload('DEVICE_CONFIGURING_ERROR'),
  finish: actionFromPayload('DEVICE_CONFIGURING_FINISH'),
};
