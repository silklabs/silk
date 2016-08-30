/**
 * @flow
 */

import {
  actionFromPayload,
  actionFromAsyncPayloadGen,
} from 'silk-redux/action';

import * as Util from '../libraries/Util';

export const clearState = actionFromPayload('WIFICONFIG_CLEARSTATE');

export const getLocalInfo = actionFromAsyncPayloadGen('WIFICONFIG_LOCALINFO', Util.getWifiInfo);

export const enterManually = actionFromPayload('WIFICONFIG_ENTERMANUALLY');
export const selectFromList = actionFromPayload('WIFICONFIG_SELECTLIST');

export const setNetwork = actionFromPayload('WIFICONFIG_SETNETWORK');
export const setPassword = actionFromPayload('WIFICONFIG_SETPASSWORD');
export const setManualSSID = actionFromPayload('WIFICONFIG_SETMANUALSSID');
export const setManualPSK = actionFromPayload('WIFICONFIG_SETMANUALPSK');
