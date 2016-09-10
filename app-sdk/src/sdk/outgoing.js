/**
 * @flow
 */

import type {DeviceWifiNetwork} from '../ble/device_session';
import type {
  DownloadProgress,
  UpdateState,
} from 'silk-update';

type InitializedMessage = {
  type: 'INITIALIZED';
};

type MessageError =
    'NOT_INITIALIZED'
  | 'INVALID_MESSAGE_FORMAT'
  | 'INVALID_MESSAGE_TYPE'
  ;

type MessageErrorMessage = {
  type: 'MESSAGE_ERROR';
  error: MessageError; // TODO: rename to messageError
  message: any;
};

type ClientConnectionStatus =
    'NOT_CONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  ;
type ClientConnectionError =
    'SERVER_UNREACHABLE'
  ;

type ClientAuthStatus =
    'NOT_AUTHENTICATED'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED'
  ;

// TODO: enum these
type ClientAuthError = string;

export type ClientStatusMessage = {
  type: 'CLIENT_STATUS';
  clientConnectionStatus: ClientConnectionStatus;
  clientConnectionError: ?ClientConnectionError;
  clientAuthStatus: ClientAuthStatus;
  clientAuthError: ?ClientAuthError;
};

type DeviceConfigStatus = 'CONFIGURED' | 'UNCONFIGURED';
export type ConnectionStatus = 'NOT_CONNECTED' | 'CONNECTING' | 'CONNECTED';

// TODO: enum these
type WifiConnectionError = string;
type ServerConnectionError = string;
type BLEConnectionError = string;
type RTCConnectionError =
    'NETWORK_UNREACHABLE'
  | 'DEVICE_UNAVAILABLE'
  | 'UNAUTHORIZED'
  ;

export type DeviceStatusMessage = {
  type: 'DEVICE_STATUS',
  deviceType: string;
  deviceVersion: ?string;
  deviceId: ?string;
  deviceConfigId: ?number;
  accountDeviceNumber: ?number;
  deviceConfigStatus: DeviceConfigStatus;
  bleConnectionStatus: ?ConnectionStatus;
  bleConnectionError: ?BLEConnectionError;
  rtcConnectionStatus: ?ConnectionStatus;
  rtcConnectionError: ?RTCConnectionError;
};

export type DeviceListMessage = {
  type: 'DEVICE_LIST';
  devices: Array<DeviceStatusMessage>;
};

type DeviceConfigWifiScanResultsMessage = {
  type: 'DEVICE_CONFIG_WIFI_NETWORKS';
  deviceConfigId: number;
  wifiNetworks: Array<DeviceWifiNetwork>;
};

type DeviceConfigSuccessMessage = {
  type: 'DEVICE_CONFIG_SUCCESS';
  deviceConfigId: number;
};

type DeviceConfigFatalErrorMessage = {
  type: 'DEVICE_CONFIG_FATAL_ERROR';
  deviceConfigId: number;
  configError: string; // TODO enum
};

type DeviceRemoveSuccessMessage = {
  type: 'DEVICE_REMOVE_SUCCESS';
  deviceId: string;
};

type DeviceRemoveErrorMessage = {
  type: 'DEVICE_REMOVE_ERROR';
  deviceId: string;
  error: string; // TODO
};

type DeviceMessageMessage = {
  type: 'DEVICE_MESSAGE';
  deviceId: string;
  payload: any;
};

type DeviceMessageErrorMessage = {
  type: 'DEVICE_MESSAGE_ERROR';
  deviceId: string;
  error: string; // TODO
};

type DeviceWifiNetworksMessage = {
  type: 'DEVICE_WIFI_NETWORKS';
  deviceId: string;
  wifiNetworks: Array<DeviceWifiNetwork>;
};

export type DeviceConnectionDetailsMessage = {
  type: 'DEVICE_CONNECTION_DETAILS',
  deviceId: ?string;
  accountDeviceNumber: ?number;
  paired: boolean;
  wifiStatus: ?ConnectionStatus;
  wifiSSID: ?string;
  wifiLevel: ?number;
  wifiError: ?WifiConnectionError;
  serverStatus: ?ConnectionStatus;
  serverError: ?ServerConnectionError;
};

export type DeviceUpdateStatusMessage = {
  type: 'DEVICE_UPDATE_STATUS',
  deviceId: ?string;
  state: UpdateState;
  progress: ?DownloadProgress;
  error: ?Error;
};

export type OutgoingMessage =
    InitializedMessage
  | MessageErrorMessage
  | ClientStatusMessage
  | DeviceStatusMessage
  | DeviceListMessage
  | DeviceConfigWifiScanResultsMessage
  | DeviceConfigSuccessMessage
  | DeviceConfigFatalErrorMessage
  | DeviceRemoveSuccessMessage
  | DeviceRemoveErrorMessage
  | DeviceMessageMessage
  | DeviceMessageErrorMessage
  | DeviceWifiNetworksMessage
  | DeviceConnectionDetailsMessage
  | DeviceUpdateStatusMessage
  ;
