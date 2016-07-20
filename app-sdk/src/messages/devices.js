/**
 * @flow
 */

import * as actions from '../store/actions';

import type {Store} from './store';

type DeviceConfigStatus = 'CONFIGURED' | 'UNCONFIGURED';
type ConnectionStatus = 'NOT_CONNECTED' | 'CONNECTING' | 'CONNECTED';
// TODO:
type WifiConnectionError = string;
type ServerConnectionError = string;
type BLEConnectionError = string;
type RTCConnectionError = string;

export type DeviceStatusMessage = {
  type: 'DEVICE_STATUS',
  deviceType: string;
  deviceId: ?string;
  deviceConfigId: ?number;
  deviceConfigStatus: DeviceConfigStatus;
  wifiConnectionStatus: ?ConnectionStatus;
  wifiConnectionError: ?WifiConnectionError;
  serverConnectionStatus: ?ConnectionStatus;
  serverConnectionError: ?ServerConnectionError;
  bleConnectionStatus: ?ConnectionStatus;
  bleConnectionError: ?BLEConnectionError;
  rtcConnectionStatus: ?ConnectionStatus;
  rtcConnectionError: ?RTCConnectionError;
};

export type DeviceListMessage = {
  type: 'DEVICE_LIST';
  devices: Array<DeviceStatusMessage>;
};


export function initialize(store: Store) {
  // TODO: this feels heavy just to have something run whenever we
  // go from unauthenticated to authenticated.
  function onAuthenticated(currentState, oldState) {
    if (!oldState || currentState.auth === oldState.auth) {
      return;
    }
    if (currentState.auth.authenticated && !oldState.auth.authenticated) {
      store.dispatch(actions.devices.fetchDeviceList());
    }
  }

  store.subscribeWithState(onAuthenticated);
}
