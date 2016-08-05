/**
 * @flow
 */

import invariant from 'assert';
import createLog from 'silk-log';
import {handleActions} from 'redux-actions';

import type {Action, SimpleAction} from 'silk-app-sdk/src/store/action';
import type {DeviceWifiNetwork} from 'silk-app-sdk/src/ble/device_manager';
import type {WifiInfo} from '../libraries/Util.js';

const log = createLog('reducer-wifi');

export type WifiState = {
  /**
   * Possible values once received from native:
   * - null: the phone is connected to Wifi
   * - WifiInfo object
   */
  localWifiInfo: ?WifiInfo;

  /**
   * Whether or not we have received local WiFi info yet.
   */
  receivedLocalWifiInfo: boolean;

  /**
   * An array of DeviceWifiNetwork objects, or null if we don't have
   * that info yet.
   */
  deviceNetworks: ?Array<DeviceWifiNetwork>;

  /**
   * Whether or not we've attempted to match the phone's local WiFi
   * info yet with any of the networks seen by the device.
   */
  attemptedWifiMatch: boolean;

  /**
   * DeviceWifiNetwork network that's been automatically matched or
   * picked by the user from the `deviceNetworks` list.
   */
  selectedDeviceNetwork: ?DeviceWifiNetwork;

  /**
   * Whether the user is picking the network from the
   * device-generated list or entering it manually.
   */
  manualEntry: boolean;

  /**
   * Network info manually entered by the user.
   */
  manualNetwork: ?{
    ssid: string;
    psk: boolean;
  };

  /**
   * Wi-Fi passphrase
   */
  secret: string;
};

const initialState: WifiState = {
  localWifiInfo: null,
  receivedLocalWifiInfo: false,
  deviceNetworks: null,
  attemptedWifiMatch: false,
  selectedDeviceNetwork: null,
  manualEntry: false,
  manualNetwork: null,
  secret: '',
};

function WIFI_CLEAR_STATE(
  state: WifiState,
  action: SimpleAction<'WIFI_CLEAR_STATE', void>
): WifiState {
  return {...initialState};
}

function WIFI_GET_LOCAL_INFO(
  state: WifiState,
  action: Action<'WIFI_GET_LOCAL_INFO', void, WifiInfo>
): WifiState {
  if (action.error || action.requested) {
    return state;
  }
  return findBestWifiMatch({
    ...state,
    localWifiInfo: action.payload,
    receivedLocalWifiInfo: true,
  });
}

function WIFI_UPDATE_DEVICE_NETWORKS(
  state: WifiState,
  action: SimpleAction<'WIFI_UPDATE_DEVICE_NETWORKS', Array<DeviceWifiNetwork>>
): WifiState {
  return findBestWifiMatch({
    ...state,
    deviceNetworks: action.payload,
  });
}

function WIFI_SELECT_FROM_LIST(
  state: WifiState,
  action: SimpleAction<'WIFI_SELECT_FROM_LIST', void>
): WifiState {
  return {
    ...state,
    manualEntry: false,
    manualNetwork: null,
    secret: '',
  };
}

function WIFI_ENTER_MANUALLY(
  state: WifiState,
  action: SimpleAction<'WIFI_ENTER_MANUALLY', void>
): WifiState {
  return {
    ...state,
    manualEntry: true,
    manualNetwork: {
      ssid: '',
      psk: true,
    },
    secret: '',
  };
}

function WIFI_SET_NETWORK(
  state: WifiState,
  action: SimpleAction<'WIFI_SET_NETWORK', DeviceWifiNetwork>
): WifiState {
  return {
    ...state,
    selectedDeviceNetwork: action.payload,
    secret: '',
  };
}

function WIFI_SET_SECRET(
  state: WifiState,
  action: SimpleAction<'WIFI_SET_SECRET', string>
): WifiState {
  return {
    ...state,
    secret: action.payload,
  };
}

function WIFI_SET_MANUAL_SSID(
  state: WifiState,
  action: SimpleAction<'WIFI_SET_MANUAL_SSID', string>
): WifiState {
  invariant(state.manualEntry);
  return {
    ...state,
    manualNetwork: {
      ...state.manualNetwork,
      ssid: action.payload,
    },
  };
}

function WIFI_SET_MANUAL_PSK(
  state: WifiState,
  action: SimpleAction<'WIFI_SET_MANUAL_PSK', boolean>
): WifiState {
  invariant(state.manualEntry);
  return {
    ...state,
    manualNetwork: {
      ...state.manualNetwork,
      psk: action.payload,
    },
  };
}

export const reducer = handleActions({
  WIFI_CLEAR_STATE,
  WIFI_GET_LOCAL_INFO,
  WIFI_UPDATE_DEVICE_NETWORKS,
  WIFI_SELECT_FROM_LIST,
  WIFI_ENTER_MANUALLY,
  WIFI_SET_NETWORK,
  WIFI_SET_SECRET,
  WIFI_SET_MANUAL_SSID,
  WIFI_SET_MANUAL_PSK,
}, initialState);

function findBestWifiMatch(state: WifiState): WifiState {
  const {localWifiInfo, deviceNetworks} = state;

  // If we have gotten a match before, or a manual entry, or if we
  // don't have all info yet, don't try to do any matching. But do
  // set newer values for either device or local WiFi info.
  if (state.attemptedWifiMatch) {
    log.debug('Already attempted to match WiFi networks, not trying again.');
    return state;
  }
  if (state.selectedDeviceNetwork) {
    log.debug('A WiFi network was already selected, not going to overwrite that.');
    return state;
  }
  if (!state.receivedLocalWifiInfo) {
    log.debug('Not received local WiFi info yet.');
    return state;
  }
  if (!deviceNetworks) {
    log.debug('Not received WiFi networks from device yet.');
    return state;
  }

  state.attemptedWifiMatch = true;
  if (!deviceNetworks.length) {
    log.debug('Device does not see a single WiFi network.');
    state.selectedDeviceNetwork = null;
    return state;
  }

  // Return strongest WiFi seen by device if the phone isn't
  // connected to any WiFi network.
  if (!localWifiInfo) {
    log.debug('Local phone/tablet is not connected to WiFi');
    state.selectedDeviceNetwork =
      deviceNetworks.slice().sort((a, b) => b.level - a.level)[0];
    return state;
  }

  let selectedDeviceNetwork =
    deviceNetworks.find((network) => network.ssid === localWifiInfo.SSID);
  if (selectedDeviceNetwork) {
    log.debug('Found match based on SSID:', selectedDeviceNetwork);
    state.selectedDeviceNetwork = selectedDeviceNetwork;
    return state;
  }

  selectedDeviceNetwork =
    deviceNetworks.slice().sort((a, b) => b.level - a.level)[0];
  log.debug('Resorting to WiFi with strongest RSSI:', selectedDeviceNetwork);
  state.selectedDeviceNetwork = selectedDeviceNetwork;

  return state;
}
