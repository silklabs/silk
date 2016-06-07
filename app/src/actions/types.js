/**
 * @flow
 */

import type { WifiInfo } from '../libraries/Util.js';
import type { DeviceWifiNetwork } from '../libraries/ble/DeviceManager';

export type Action =
    { type: 'CLEAR_STATE' }
  | { type: 'DETERMINED_LOCAL_WIFI_INFO', wifiInfo: ?WifiInfo }
  | { type: 'SCANNED_DEVICE_NETWORKS', deviceNetworks: Array<DeviceWifiNetwork> }
  | { type: 'SELECT_DEVICE_NETWORK', deviceNetwork: DeviceWifiNetwork }
  | { type: 'SELECT_ENTER_MANUALLY' }
  | { type: 'SELECT_CHOOSE_FROM_DEVICE_LIST' }
  | { type: 'CHANGE_SECRET', secret: string }
  | { type: 'CHANGE_MANUAL_NETWORK_SSID', ssid: string }
  | { type: 'CHANGE_MANUAL_NETWORK_PSK', psk: boolean }
  ;
export type Dispatch = (action: Action | ThunkAction | Array<Action>) => any;
export type GetState = () => Object;
export type ThunkAction = (dispatch: Dispatch, getState: GetState) => any;
