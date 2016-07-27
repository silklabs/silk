/**
 * @flow
 */

import {
  actionFromPayload,
  actionFromAsyncPayloadGen,
} from 'silk-app-sdk/src/store/action';

import * as Util from '../libraries/Util';

export const clearState = actionFromPayload('WIFI_CLEAR_STATE');

export const getLocalInfo = actionFromAsyncPayloadGen('WIFI_GET_LOCAL_INFO', Util.getWifiInfo);
export const updateDeviceNetworks = actionFromPayload('WIFI_UPDATE_DEVICE_NETWORKS');

export const enterManually = actionFromPayload('WIFI_ENTER_MANUALLY');
export const selectFromList = actionFromPayload('WIFI_SELECT_FROM_LIST');

export const setNetwork = actionFromPayload('WIFI_SET_NETWORK');
export const setSecret = actionFromPayload('WIFI_SET_SECRET');
export const setManualSSID = actionFromPayload('WIFI_SET_MANUAL_SSID');
export const setManualPSK = actionFromPayload('WIFI_SET_MANUAL_PSK');
