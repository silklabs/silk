/**
 * @flow
 */

import invariant from 'assert';
import {AsyncStorage, NativeModules} from 'react-native';
import {AccessToken} from 'silk-api';
import createLog from 'silk-log';
import * as onion from 'silk-onion';
import * as silkRTC from 'silk-rtc';
import {
  actionFromPayload,
  actionFromPayloadGen,
  actionFromAsyncPayloadGen,
} from 'silk-redux/action';

import type {ListDevicesOutput} from 'silk-api/src/gen/account';
import {Peer} from 'silk-rtc';

import type {StateWithApi} from './api';
import type {DevicesState} from './device_reducers';
import type {State} from './reducers';
import type {
  default as DeviceSession,
  WifiConfiguration,
  RegistrationInformation,
} from '../ble/device_session';

type StateWithDevices = {
  devices: DevicesState;
};

export type DeviceConfig = {
  name: string;
  wifiSSID: string;
  wifiPassword: ?string;
};

export type UnregisterRegisteredDeviceResult = {
  deviceId: string;
  success: boolean;
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

export type ChangeWifiConfiguration = WifiConfiguration & {
  deviceId: string;
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

function genUnregisterBegin(
  state: State,
  input: string
): Promise<string> {
  const {api, devices} = state;
  invariant(api);
  invariant(devices);

  const {accessToken} = api;
  invariant(accessToken);

  const {registered} = devices;
  invariant(registered);
  const device = registered.get(input);
  invariant(device);

  const {unregister} = device;
  invariant(unregister);
  invariant(!unregister.factoryResetMessage);

  return onion.genEncode({
    senderIdentity: accessToken,
    recipientIdentity: AccessToken.importPub(input),
    channel: 'http',
    payload: {name: `reset`},
  }).then((buffer) => buffer.toString('base64'));
}

function genUnregisterServer(
  state: State,
  input: string
): Promise<UnregisterRegisteredDeviceResult> {
  const {api, devices} = state;
  invariant(api);
  invariant(devices);

  const {accessToken} = api;
  invariant(accessToken);

  const {registered} = devices;
  invariant(registered);
  const device = registered.get(input);
  invariant(device);
  invariant(device.unregister);
  invariant(device.unregister.factoryResetMessage);

  return api.account.unregisterDevice({
    devicePublicKey: input,
    factoryResetMessage: device.unregister.factoryResetMessage,
  }).then((result) => ({
    deviceId: input,
    success: result.success,
  }));
}

function unregisterPeer(
  state: StateWithDevices,
  input: string
): void {
  const {devices} = state;
  invariant(devices);

  const {registered} = devices;
  invariant(registered);
  const device = registered.get(input);
  invariant(device);

  const {rtc, unregister} = device;
  invariant(rtc.peer);
  invariant(unregister);
  invariant(unregister.factoryResetMessage);

  const channel = rtc.peer.createChannel('system');
  channel.emit('system', {message: unregister.factoryResetMessage});
}

function disconnect(
  state: StateWithDevices,
  input: string
): string {
  const {registered} = state.devices;
  invariant(registered);
  const device = registered.get(input);
  invariant(device);
  if (device.ble.session) {
    device.ble.session.disconnect();
  }
  return input;
}

function configAccept(
  state: StateWithDevices,
  input: number
): DeviceSession {
  const {unconfigured} = state.devices;
  const session = unconfigured.get(input);
  invariant(session);
  session.acceptRegistrationRequest();
  return session;
}

function configDecline(
  state: StateWithDevices,
  input: number
): DeviceSession {
  const {unconfigured} = state.devices;
  const session = unconfigured.get(input);
  invariant(session);
  session.declineRegistrationRequest();
  return session;
}

function configAbort(
  state: StateWithDevices,
): ?DeviceSession {
  const {unconfigured, configuring} = state.devices;
  invariant(configuring);
  const session = unconfigured.get(configuring.socketId);
  if (session) {
    session.restart();
  }
  return session;
}

function sendConfig(
  state: StateWithDevices,
  input: RegistrationInformation
): DeviceSession {
  const {unconfigured, configuring} = state.devices;
  invariant(configuring);
  const session = unconfigured.get(configuring.socketId);
  invariant(session);
  session.sendRegistrationInformation(input);
  return session;
}

async function genRegisterConfiguringDeviceWithServer(
  state: StateWithApi,
  input: RegisterConfiguringDeviceInput,
): Promise<RegisterConfiguringDeviceResult> {
  const {api} = state;
  invariant(api);

  const {devicePublicKey} = input;
  invariant(devicePublicKey);

  log.info('Registering device', input);

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
    success,
    name: input.name,
    type: input.type,
    registrationToken,
    beaconUUID,
  };
}

function genRTCSignalDevice(
  state: StateWithApi,
  input: string
): Promise<Peer> {
  const {api} = state;
  invariant(api);

  const peer = silkRTC.call(api, input);
  return peer.connect().then(() => peer);
}

function wifiList(
  state: StateWithDevices,
  input: string,
): string {
  const {registered} = state.devices;
  invariant(registered);
  const device = registered.get(input);
  invariant(device);
  const {session} = device.ble;
  invariant(session);
  session.listWifi();
  return input;
}

function wifiSet(
  state: StateWithDevices,
  input: ChangeWifiConfiguration,
): ChangeWifiConfiguration {
  const {registered} = state.devices;
  invariant(registered);
  const device = registered.get(input.deviceId);
  invariant(device);
  const {session} = device.ble;
  invariant(session);
  session.selectWifi(input);
  return input;
}

function wifiGetInfo(
  state: StateWithDevices,
  input: string,
): string {
  const {registered} = state.devices;
  invariant(registered);
  const device = registered.get(input);
  invariant(device);
  const {session} = device.ble;
  invariant(session);
  session.getWifiInfo();
  return input;
}


// Thunk Actions

export const registered = {
  restoreList: actionFromAsyncPayloadGen('DEVICE_REGISTERED_RESTORE', genRestoreRegisteredDeviceList),
  fetchList: actionFromAsyncPayloadGen('DEVICE_REGISTERED_FETCH', genFetchRegisteredDeviceList),
  unregisterBegin: actionFromAsyncPayloadGen('DEVICE_REGISTERED_UNREGISTER_BEGIN', genUnregisterBegin),
  unregisterWithServer: actionFromAsyncPayloadGen('DEVICE_REGISTERED_UNREGISTER_SERVER', genUnregisterServer),
  unregisterWithPeer: actionFromPayloadGen('DEVICE_REGISTERED_UNREGISTER_PEER', unregisterPeer),
};

// Actions
//
// Most of these are meant to be fed from events emitted by the BLE
// DeviceSession.

export const ble = {
  connect: actionFromPayload('DEVICE_BLE_CONNECT'),
  disconnect: actionFromPayloadGen('DEVICE_BLE_DISCONNECT', disconnect),

  // These actions are dispatched by events emitted by the BLE machinery.
  connected: actionFromPayload('DEVICE_BLE_CONNECTED'),
  disconnected: actionFromPayload('DEVICE_BLE_DISCONNECTED'),
  error: actionFromPayload('DEVICE_BLE_ERROR'),
};

export const config = {
  accept: actionFromPayloadGen('DEVICE_CONFIG_ACCEPT', configAccept),
  decline: actionFromPayloadGen('DEVICE_CONFIG_DECLINE', configDecline),
  abort: actionFromPayloadGen('DEVICE_CONFIG_ABORT', configAbort),
  setConfig: actionFromPayload('DEVICE_CONFIG_SETCONFIG'),
  registerWithServer: actionFromAsyncPayloadGen('DEVICE_CONFIG_REGISTERSERVER', genRegisterConfiguringDeviceWithServer),
  sendConfig: actionFromPayloadGen('DEVICE_CONFIG_SENDCONFIG', sendConfig),
  finish: actionFromPayload('DEVICE_CONFIG_FINISH'),

  wifiList: actionFromPayloadGen('DEVICE_WIFI_LIST', wifiList),
  wifiSet: actionFromPayloadGen('DEVICE_WIFI_SET', wifiSet),
  wifiGetInfo: actionFromPayloadGen('DEVICE_WIFI_GETINFO', wifiGetInfo),

  // These actions are dispatched by events emitted by the BLE machinery.
  passedProximity: actionFromPayload('DEVICE_CONFIG_PROXIMITYGATE'),
  wifiScanResults: actionFromPayload('DEVICE_CONFIG_WIFISCANRESULTS'),
  wifiInfo: actionFromPayload('DEVICE_CONFIG_WIFIINFO'),
  connectionStatus: actionFromPayload('DEVICE_CONFIG_CONNECTIONSTATUS'),
  updateStatus: actionFromPayload('DEVICE_CONFIG_UPDATESTATUS'),
  registered: actionFromPayload('DEVICE_CONFIG_REGISTERED'),
};

export const rtc = {
  signal: actionFromAsyncPayloadGen('DEVICE_RTC_SIGNAL', genRTCSignalDevice),
  connectionClosed: actionFromPayload('DEVICE_RTC_CONNECTIONCLOSED'),
};
