/**
 * @flow
 */

import invariant from 'assert';

import * as actions from '../store/actions';
import emitter from './emitter';

import type {SDKStore} from './store';
import type {
  DeviceConfigAcceptMessage,
  DeviceConfigDeclineMessage,
  DeviceConfigSetConfigMessage,
  DeviceConfigAbortMessage,
  DeviceRemoveMessage,
  DeviceMessageMessage,
} from './incoming';

// Incoming messages:

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

function DEVICE_REMOVE(
  store: SDKStore,
  message: DeviceRemoveMessage,
) {
  store.dispatch(actions.devices.registered.unregister({
    devicePublicKey: message.deviceId,
  })).then(() => {
    emitter.postMessage({
      type: 'DEVICE_REMOVE_SUCCESS',
      deviceId: message.deviceId,
    });
  }).catch((error) => {
    emitter.postMessage({
      type: 'DEVICE_REMOVE_ERROR',
      deviceId: message.deviceId,
      error: error.message, // TODO: probably want to enum this...
    });
  });
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

// TODO: send DEVICE_CONFIG_ERROR for incorrect wifi password (if we even can?)

export const messageHandlers = {
  DEVICE_CONFIG_ACCEPT,
  DEVICE_CONFIG_DECLINE,
  DEVICE_CONFIG_SET_CONFIG,
  DEVICE_CONFIG_ABORT,
  DEVICE_REMOVE,
  DEVICE_MESSAGE,
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

  store.subscribeToPath('devices.configuring.registered', (registered) => {
    if (!registered) {
      return;
    }

    const {configuring} = store.getState().devices;
    invariant(configuring);
    emitter.postMessage({
      type: 'DEVICE_CONFIG_SUCCESS',
      deviceConfigId: configuring.socketId,
    });

    store.dispatch(actions.devices.config.finish());
  });

  store.subscribeToPath('devices.configuring.error', (error) => {
    if (!error) {
      return;
    }

    const {configuring} = store.getState().devices;
    invariant(configuring);
    emitter.postMessage({
      type: 'DEVICE_CONFIG_FATAL_ERROR',
      deviceConfigId: configuring.socketId,
      configError: error.message, // TODO enum
    });

    store.dispatch(actions.devices.config.finish());
  });
}
