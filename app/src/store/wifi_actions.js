/**
 * @flow
 */

import {genWifiInfo} from 'silk-app-util';
import {
  actionFromPayload,
  actionFromAsyncPayloadGen,
} from 'silk-redux/action';

export const clearState = actionFromPayload('WIFICONFIG_CLEARSTATE');

export const getLocalInfo = actionFromAsyncPayloadGen('WIFICONFIG_LOCALINFO', genWifiInfo);

export const enterManually = actionFromPayload('WIFICONFIG_ENTERMANUALLY');
export const selectFromList = actionFromPayload('WIFICONFIG_SELECTLIST');

export const setNetwork = actionFromPayload('WIFICONFIG_SETNETWORK');
export const setPassword = actionFromPayload('WIFICONFIG_SETPASSWORD');
export const setManualSSID = actionFromPayload('WIFICONFIG_SETMANUALSSID');
export const setManualPSK = actionFromPayload('WIFICONFIG_SETMANUALPSK');
