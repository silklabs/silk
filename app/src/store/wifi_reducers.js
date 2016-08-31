/**
 * @flow
 */

import invariant from 'assert';
import createLog from 'silk-log';
import {handleActions} from 'redux-actions';
import type {Action, SimpleAction} from 'silk-redux/action';

import type {
  default as DeviceSession,
  DeviceWifiNetwork,
} from 'silk-app-sdk/src/ble/device_session';

import type {WifiInfo} from '../libraries/Util.js';

const log = createLog('reducer-wifi');

export type WifiConfigState = {
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
   * Wi-Fi password
   */
  password: string;
};

const initialState: WifiConfigState = {
  localWifiInfo: null,
  receivedLocalWifiInfo: false,
  deviceNetworks: null,
  attemptedWifiMatch: false,
  selectedDeviceNetwork: null,
  manualEntry: false,
  manualNetwork: null,
  password: '',
};

function WIFICONFIG_CLEARSTATE(
  state: WifiConfigState,
  action: SimpleAction<'WIFICONFIG_CLEARSTATE', void>
): WifiConfigState {
  return {...initialState};
}

function WIFICONFIG_LOCALINFO(
  state: WifiConfigState,
  action: Action<'WIFIGET_LOCALINFO', void, WifiInfo>
): WifiConfigState {
  if (action.error || action.requested) {
    return state;
  }
  return findBestWifiMatch({
    ...state,
    localWifiInfo: action.payload,
    receivedLocalWifiInfo: true,
  });
}

function DEVICE_CONFIG_WIFISCANRESULTS(
  state: WifiConfigState,
  action: SimpleAction<'DEVICE_CONFIG_WIFISCANRESULTS', DeviceSession>
): WifiConfigState {
  return findBestWifiMatch({
    ...state,
    deviceNetworks: action.payload.wifiNetworks,
  });
}

function WIFICONFIG_SELECTLIST(
  state: WifiConfigState,
  action: SimpleAction<'WIFICONFIG_SELECTLIST', void>
): WifiConfigState {
  return {
    ...state,
    manualEntry: false,
    manualNetwork: null,
    secret: '',
  };
}

function WIFICONFIG_ENTERMANUALLY(
  state: WifiConfigState,
  action: SimpleAction<'WIFICONFIG_ENTERMANUALLY', void>
): WifiConfigState {
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

function WIFICONFIG_SETNETWORK(
  state: WifiConfigState,
  action: SimpleAction<'WIFICONFIG_SETNETWORK', DeviceWifiNetwork>
): WifiConfigState {
  return {
    ...state,
    selectedDeviceNetwork: action.payload,
    secret: '',
  };
}

function WIFICONFIG_SETPASSWORD(
  state: WifiConfigState,
  action: SimpleAction<'WIFICONFIG_SETPASSWORD', string>
): WifiConfigState {
  return {
    ...state,
    password: action.payload,
  };
}

function WIFICONFIG_SETMANUALSSID(
  state: WifiConfigState,
  action: SimpleAction<'WIFICNOFIG_SETMANUALSSID', string>
): WifiConfigState {
  invariant(state.manualEntry);
  return {
    ...state,
    manualNetwork: {
      ...state.manualNetwork,
      ssid: action.payload,
    },
  };
}

function WIFICONFIG_SETMANUALPSK(
  state: WifiConfigState,
  action: SimpleAction<'WIFICONFIG_SETMANUALPSK', boolean>
): WifiConfigState {
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
  WIFICONFIG_CLEARSTATE,
  WIFICONFIG_LOCALINFO,
  DEVICE_CONFIG_WIFISCANRESULTS,
  WIFICONFIG_SELECTLIST,
  WIFICONFIG_ENTERMANUALLY,
  WIFICONFIG_SETNETWORK,
  WIFICONFIG_SETPASSWORD,
  WIFICONFIG_SETMANUALSSID,
  WIFICONFIG_SETMANUALPSK,
}, initialState);

function findBestWifiMatch(state: WifiConfigState): WifiConfigState {
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
