/**
 * @flow
 */

import invariant from 'assert';
import {actions} from 'silk-app-client';

import emitter from './emitter';

import type {SDKStore} from './store';
import type {
  DeviceListUpdateMessage,
  DeviceConfigAcceptMessage,
  DeviceConfigDeclineMessage,
  DeviceConfigSetConfigMessage,
  DeviceConfigAbortMessage,
  DeviceRemoveMessage,
  DeviceMessageMessage,
  DeviceBLEConnectMessage,
  DeviceBLEDisconnectMessage,
  DeviceWifiListMessage,
  DeviceWifiSetMessage,
  DeviceWifiGetInfoMessage,
  DeviceMediaStreamMessage,
} from './incoming';

// Incoming messages:

function DEVICE_LIST_UPDATE(
  store: SDKStore,
  message: DeviceListUpdateMessage,
) {
  store.dispatch(actions.devices.registered.fetchList());
}

function DEVICE_CONFIG_ACCEPT(
  store: SDKStore,
  message: DeviceConfigAcceptMessage,
) {
  store.dispatch(actions.devices.config.accept(message.deviceConfigId));
}

function DEVICE_CONFIG_DECLINE(
  store: SDKStore,
  message: DeviceConfigDeclineMessage,
) {
  store.dispatch(actions.devices.config.decline(message.deviceConfigId));
}

function DEVICE_CONFIG_SET_CONFIG(
  store: SDKStore,
  message: DeviceConfigSetConfigMessage,
) {
  const {configuring} = store.getState().devices;
  invariant(configuring);
  invariant(configuring.socketId === message.deviceConfigId);
  store.dispatch(actions.devices.config.setConfig({
    name: message.deviceName,
    wifiSSID: message.wifiSSID,
    wifiPassword: message.wifiPassword,
  }));
}

function DEVICE_CONFIG_ABORT(
  store: SDKStore,
  message: DeviceConfigAbortMessage,
) {
  const {configuring} = store.getState().devices;
  invariant(configuring);
  invariant(configuring.socketId === message.deviceConfigId);
  store.dispatch(actions.devices.config.abort());
}

// TODO: send DEVICE_CONFIG_ERROR for incorrect wifi password (if we even can?)

function DEVICE_BLE_CONNECT(
  store: SDKStore,
  message: DeviceBLEConnectMessage,
) {
  const {registered} = store.getState().devices;
  invariant(registered);
  invariant(registered.has(message.deviceId));
  store.dispatch(actions.devices.ble.connect(message.deviceId));
}

function DEVICE_BLE_DISCONNECT(
  store: SDKStore,
  message: DeviceBLEDisconnectMessage,
) {
  const {registered} = store.getState().devices;
  invariant(registered);
  invariant(registered.has(message.deviceId));
  store.dispatch(actions.devices.ble.disconnect(message.deviceId));
}

function DEVICE_WIFI_LIST(
  store: SDKStore,
  message: DeviceWifiListMessage,
) {
  const {registered} = store.getState().devices;
  invariant(registered);
  invariant(registered.has(message.deviceId));
  store.dispatch(actions.devices.config.wifiList(message.deviceId));
}

function DEVICE_WIFI_SET(
  store: SDKStore,
  message: DeviceWifiSetMessage,
) {
  const {registered} = store.getState().devices;
  invariant(registered);
  invariant(registered.has(message.deviceId));
  store.dispatch(actions.devices.config.wifiSet({
    deviceId: message.deviceId,
    accessPoint: message.accessPoint,
    password: message.password,
  }));
}

function DEVICE_WIFI_GETINFO(
  store: SDKStore,
  message: DeviceWifiGetInfoMessage,
) {
  const {registered} = store.getState().devices;
  invariant(registered);
  const device = registered.get(message.deviceId);
  invariant(device);
  invariant(device.ble.session);
  store.dispatch(actions.devices.config.wifiGetInfo(message.deviceId));
}

function DEVICE_REMOVE(
  store: SDKStore,
  message: DeviceRemoveMessage,
) {
  const {deviceId} = message;
  const {registered} = store.getState().devices;
  invariant(registered);
  const device = registered.get(deviceId);
  invariant(device);
  const {unregister} = device;
  invariant(!unregister ||
            (unregister.serverStatus && unregister.serverFailure));

  store.dispatch(actions.devices.registered.unregisterBegin(deviceId));
}

function DEVICE_MESSAGE(
  store: SDKStore,
  message: DeviceMessageMessage,
) {
  const {registered} = store.getState().devices;
  if (!registered || !registered.has(message.deviceId)) {
    emitter.postMessage({
      type: 'DEVICE_MESSAGE_ERROR',
      deviceId: message.deviceId,
      error: 'INVALID_DEVICE_ID',
    });
    return;
  }

  const device = registered.get(message.deviceId);
  invariant(device);
  const {peer} = device.rtc;
  if (!peer) {
    emitter.postMessage({
      type: 'DEVICE_MESSAGE_ERROR',
      deviceId: message.deviceId,
      error: 'NOT_CONNECTED',
    });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(message.payload);
  } catch (err) {
    emitter.postMessage({
      type: 'DEVICE_MESSAGE_ERROR',
      deviceId: message.deviceId,
      error: 'PAYLOAD_IS_NOT_VALID_JSON',
    });
    return;
  }

  if (!payload || (typeof payload !== 'object')) {
    payload = {payload};
  }

  const channel = peer.createChannel('app');
  channel.emit('message', payload);
}

function DEVICE_RTC_PREVIEW_ENABLE(
  store: SDKStore,
  message: DeviceMediaStreamMessage,
) {
  store.dispatch(actions.devices.rtc.previewEnable(message.deviceId));
}

function DEVICE_RTC_PREVIEW_DISABLE(
  store: SDKStore,
  message: DeviceMediaStreamMessage,
) {
  store.dispatch(actions.devices.rtc.previewDisable(message.deviceId));
}

function DEVICE_RTC_VIDEO_ENABLE(
  store: SDKStore,
  message: DeviceMediaStreamMessage,
) {
  store.dispatch(actions.devices.rtc.videoEnable(message.deviceId));
}

function DEVICE_RTC_VIDEO_DISABLE(
  store: SDKStore,
  message: DeviceMediaStreamMessage,
) {
  store.dispatch(actions.devices.rtc.videoDisable(message.deviceId));
}


export const messageHandlers = {
  DEVICE_LIST_UPDATE,
  DEVICE_CONFIG_ACCEPT,
  DEVICE_CONFIG_DECLINE,
  DEVICE_CONFIG_SET_CONFIG,
  DEVICE_CONFIG_ABORT,
  DEVICE_REMOVE,
  DEVICE_MESSAGE,
  DEVICE_BLE_CONNECT,
  DEVICE_BLE_DISCONNECT,
  DEVICE_WIFI_LIST,
  DEVICE_WIFI_SET,
  DEVICE_WIFI_GETINFO,
  DEVICE_RTC_PREVIEW_ENABLE,
  DEVICE_RTC_PREVIEW_DISABLE,
  DEVICE_RTC_VIDEO_ENABLE,
  DEVICE_RTC_VIDEO_DISABLE,
};

export function init(store: SDKStore) {
  store.subscribeToPath('devices.registered', (newDevices, oldDevices) => {
    if (!newDevices) {
      return;
    }
    newDevices.forEach((newDevice, deviceId) => {
      const oldDevice = oldDevices ? oldDevices.get(deviceId) : null;
      if (!oldDevice) {
        return;
      }
      const oldPeer = oldDevice.rtc.peer;
      const newPeer = newDevice.rtc.peer;
      if (!oldPeer && newPeer) {
        // Newly established connection. Let's create the datachannel and
        // subscribe to it so we can forward incoming messages to native.
        const channel = newPeer.createChannel('app');
        channel.on('message', (payload) => {
          emitter.postMessage({
            type: 'DEVICE_MESSAGE',
            deviceId,
            payload,
          });
        });
      } else if (oldPeer && !newPeer) {
        const channel = oldPeer.getChannel('app');
        if (channel) {
          channel.removeAllListeners();
        }
      }
    });
  });

  store.subscribeToPath('devices.configuring.registered', (registered, _, state) => {
    if (!registered) {
      return;
    }

    const {configuring} = state.devices;
    invariant(configuring);
    emitter.postMessage({
      type: 'DEVICE_CONFIG_SUCCESS',
      deviceConfigId: configuring.socketId,
    });

    store.dispatch(actions.devices.config.finish());
  });

  store.subscribeToPath('devices.configuring.error', (error, _, state) => {
    if (!error) {
      return;
    }

    const {configuring} = state.devices;
    invariant(configuring);
    emitter.postMessage({
      type: 'DEVICE_CONFIG_FATAL_ERROR',
      deviceConfigId: configuring.socketId,
      configError: error.message, // TODO enum
    });

    store.dispatch(actions.devices.config.abort());
  });
}
