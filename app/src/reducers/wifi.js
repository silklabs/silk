/**
 * @flow
 */

import invariant from 'assert';
import createLog from 'silk-log';

import type { WifiInfo } from '../libraries/Util.js';
import type { DeviceWifiNetwork } from '../libraries/ble/DeviceManager';
import type { Action } from '../actions/types';

const log = createLog('reducer-wifi');

type State = {
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

const initialState: State = {
  localWifiInfo: null,
  receivedLocalWifiInfo: false,
  deviceNetworks: null,
  attemptedWifiMatch: false,
  selectedDeviceNetwork: null,
  manualEntry: false,
  manualNetwork: null,
  secret: '',
};

export default function wifiConfig(
  state: State = initialState,
  action: Action
): State {
  log.debug('Received action ' + action.type);
  switch (action.type) {

  case 'CLEAR_STATE':
    state = Object.assign({}, initialState);
    break;

  case 'DETERMINED_LOCAL_WIFI_INFO':
    state = Object.assign({}, state, {
      localWifiInfo: action.wifiInfo,
      receivedLocalWifiInfo: true,
    });
    findBestWifiMatch(state);
    break;

  case 'SCANNED_DEVICE_NETWORKS':
    state = Object.assign({}, state, {
      deviceNetworks: action.deviceNetworks,
    });
    findBestWifiMatch(state);
    break;

  case 'SELECT_DEVICE_NETWORK':
    state = Object.assign({}, state, {
      selectedDeviceNetwork: action.deviceNetwork,
      secret: '',
    });
    break;

  case 'SELECT_ENTER_MANUALLY':
    state = Object.assign({}, state, {
      manualEntry: true,
      manualNetwork: {
        ssid: '',
        psk: true,
      },
      secret: '',
    });
    break;

  case 'SELECT_CHOOSE_FROM_DEVICE_LIST':
    state = Object.assign({}, state, {
      manualEntry: false,
      manualNetwork: null,
      secret: '',
    });
    break;

  case 'CHANGE_SECRET':
    state = Object.assign({}, state, {
      secret: action.secret,
    });
    break;

  case 'CHANGE_MANUAL_NETWORK_SSID':
    invariant(state.manualEntry);
    state = Object.assign({}, state, {
      manualNetwork: Object.assign({}, state.manualNetwork, {
        ssid: action.ssid,
      }),
    });
    break;

  case 'CHANGE_MANUAL_NETWORK_PSK':
    invariant(state.manualEntry);
    state = Object.assign({}, state, {
      manualNetwork: Object.assign({}, state.manualNetwork, {
        psk: action.psk,
      }),
    });
    break;

  default:
    break;
  }

  return state;
}

function findBestWifiMatch(state: State) {
  const { localWifiInfo, deviceNetworks } = state;

  // If we have gotten a match before, or a manual entry, or if we
  // don't have all info yet, don't try to do any matching. But do
  // set newer values for either device or local WiFi info.
  if (state.attemptedWifiMatch) {
    log.debug('Already attempted to match WiFi networks, not trying again.');
    return;
  }
  if (state.selectedDeviceNetwork) {
    log.debug('A WiFi network was already selected, not going to overwrite that.');
    return;
  }
  if (!state.receivedLocalWifiInfo) {
    log.debug('Not received local WiFi info yet.');
    return;
  }
  if (!deviceNetworks) {
    log.debug('Not received WiFi networks from device yet.');
    return;
  }

  state.attemptedWifiMatch = true;
  if (!deviceNetworks.length) {
    log.debug('Device does not see a single WiFi network.');
    state.selectedDeviceNetwork = null;
    return;
  }

  // Return strongest WiFi seen by device if the phone isn't
  // connected to any WiFi network.
  if (!localWifiInfo) {
    log.debug('Local phone/tablet is not connected to WiFi');
    state.selectedDeviceNetwork =
      deviceNetworks.slice().sort((a, b) => b.level - a.level)[0];
    return;
  }

  let selectedDeviceNetwork =
    deviceNetworks.find((network) => network.ssid === localWifiInfo.SSID);
  if (selectedDeviceNetwork) {
    log.debug('Found match based on SSID:', selectedDeviceNetwork);
    state.selectedDeviceNetwork = selectedDeviceNetwork;
    return;
  }

  selectedDeviceNetwork =
    deviceNetworks.slice().sort((a, b) => b.level - a.level)[0];
  log.debug('Resorting to WiFi with strongest RSSI:', selectedDeviceNetwork);
  state.selectedDeviceNetwork = selectedDeviceNetwork;
}
