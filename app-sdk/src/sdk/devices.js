/**
 * @flow
 */

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
