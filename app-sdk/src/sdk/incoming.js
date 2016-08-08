/**
 * @flow
 */

export type DeviceConfigAcceptMessage = {
  type: 'DEVICE_CONFIG_ACCEPT';
  deviceConfigId: number;
};

export type DeviceConfigDeclineMessage = {
  type: 'DEVICE_CONFIG_DECLINE';
  deviceConfigId: number;
};

export type DeviceConfigSetConfigMessage = {
  type: 'DEVICE_CONFIG_SET_CONFIG';
  deviceConfigId: number;
  deviceName: string;
  wifiSSID: string;
  wifiPassword: ?string;
};

export type DeviceConfigAbortMessage = {
  type: 'DEVICE_CONFIG_ABORT';
  deviceConfigId: number;
};

export type DeviceRemoveMessage = {
  type: 'DEVICE_REMOVE';
  deviceId: string;
};

export type DeviceMessageMessage = {
  type: 'DEVICE_MESSAGE';
  deviceId: string;
  payload: any;
};
