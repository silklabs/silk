/**
 * @flow
 */

import * as Util from '../libraries/Util';

import type {DeviceWifiNetwork} from 'silk-app-sdk/src/ble/device_manager';
import type {Action, ThunkAction} from './types';

export function clearState(): Action {
  return {type: 'CLEAR_STATE'};
}

export function getLocalWifiInfo(): ThunkAction {
  return (dispatch) => {
    Util.getWifiInfo().then((wifiInfo) => {
      dispatch({
        type: 'DETERMINED_LOCAL_WIFI_INFO',
        wifiInfo,
      });
    });
  };
}

export function scannedDeviceNetworks(
  deviceNetworks: Array<DeviceWifiNetwork>
): Action {
  return {
    type: 'SCANNED_DEVICE_NETWORKS',
    deviceNetworks,
  };
}

export function selectDeviceNetwork(
  deviceNetwork: DeviceWifiNetwork
): Action {
  return {
    type: 'SELECT_DEVICE_NETWORK',
    deviceNetwork,
  };
}

export function selectEnterManually(): Action {
  return {type: 'SELECT_ENTER_MANUALLY'};
}

export function selectChooseFromDeviceList(): Action {
  return {type: 'SELECT_CHOOSE_FROM_DEVICE_LIST'};
}

export function changeSecret(secret: string): Action {
  return {
    type: 'CHANGE_SECRET',
    secret,
  };
}

export function changeManualNetworkSSID(ssid: string): Action {
  return {
    type: 'CHANGE_MANUAL_NETWORK_SSID',
    ssid,
  };
}

export function changeManualNetworkPSK(psk: boolean): Action {
  return {
    type: 'CHANGE_MANUAL_NETWORK_PSK',
    psk,
  };
}
