/**
 * Machinery to turn Redux actions into the state for App SDK messages.
 *
 * @flow
 */

import invariant from 'assert';
import {handleActions} from 'redux-actions';

import emitter from './emitter';

import type {ListDevicesOutput} from 'silk-api/src/gen/account';
import type {Peer} from 'silk-rtc';

import type {Action, SimpleAction} from '../store/action';
import type {
  ClientStatusMessage,
  DeviceListMessage,
} from './outgoing';
import type DeviceSession from '../ble/device_session';
import type {UnregisterRegisteredDeviceResult} from '../store/device_actions';

export type MessagesState = {
  CLIENT_STATUS: ClientStatusMessage,
  DEVICES: DeviceListMessage,
};

type AuthActionTypes = 'AUTH_RESTORE' | 'AUTH_SIGNIN' | 'AUTH_CREATEACCOUNT';

const initialState: MessagesState = {
  CLIENT_STATUS: {
    type: 'CLIENT_STATUS',
    clientConnectionStatus: 'NOT_CONNECTED',
    clientConnectionError: null,
    clientAuthStatus: 'NOT_AUTHENTICATED',
    clientAuthError: null,
  },
  DEVICES: {
    type: 'DEVICE_LIST',
    devices: [],
  },
};

function handleAuthAction(
  state: MessagesState,
  action: Action<AuthActionTypes, *, boolean>
): MessagesState {
  if (action.requested) {
    return {
      ...state,
      CLIENT_STATUS: {
        ...state.CLIENT_STATUS,
        clientAuthStatus: 'AUTHENTICATING',
      },
    };
  }
  if (action.error) {
    return {
      ...state,
      CLIENT_STATUS: {
        type: 'CLIENT_STATUS',
        clientConnectionStatus: 'NOT_CONNECTED',
        // TODO: analyze the error, possibly look at app state to
        // figure out if we're offline.
        //clientConnectionError: '...',
        clientConnectionError: null,
        clientAuthStatus: 'NOT_AUTHENTICATED',
        clientAuthError: null, // TODO
      },
    };
  }
  const clientAuthStatus = action.payload ? 'AUTHENTICATED' : 'NOT_AUTHENTICATED';
  if (state.CLIENT_STATUS.clientAuthStatus === clientAuthStatus) {
    return state;
  }

  return {
    ...state,
    CLIENT_STATUS: {
      ...state.CLIENT_STATUS,
      clientAuthStatus,
    },
  };
}

function AUTH_SIGNOUT(
  state: MessagesState,
  action: Action<'AUTH_SIGNOUT', void, boolean>
): MessagesState {
  if (action.requested) {
    return state;
  }
  if (action.error) {
    // Ignore.
  }
  return {
    ...initialState,
  };
}

function NETWORK_SERVER_REACHABLE(
  state: MessagesState,
  action: Action<'NETWORK_SERVER_REACHABLE', void, boolean>
): MessagesState {
  if (action.requested) {
    if (state.CLIENT_STATUS.clientConnectionStatus === 'CONNECTED' ||
        state.CLIENT_STATUS.clientConnectionStatus === 'CONNECTING') {
      // Avoid flipping from 'CONNECTED' to 'CONNECTING'.
      return state;
    }
    return {
      ...state,
      CLIENT_STATUS: {
        ...state.CLIENT_STATUS,
        clientConnectionStatus: 'CONNECTING',
      },
    };
  }

  // canReachServer() should never throw. If it does, it's a bug.
  invariant(!action.error);

  const clientConnectionStatus = action.payload ? 'CONNECTED' : 'NOT_CONNECTED';
  const clientConnectionError = action.payload ? null : 'SERVER_UNREACHABLE';

  if (state.CLIENT_STATUS.clientConnectionStatus === clientConnectionStatus &&
      state.CLIENT_STATUS.clientConnectionError === clientConnectionError) {
    return state;
  }

  return {
    ...state,
    CLIENT_STATUS: {
      ...state.CLIENT_STATUS,
      clientConnectionStatus,
      clientConnectionError,
    },
  };
}

function DEVICE_REGISTERED_FETCH(
  state: MessagesState,
  action: Action<'DEVICE_REGISTERED_FETCH', void, ListDevicesOutput>
): MessagesState {
  if (action.requested) {
    return state;
  }
  if (action.error) {
    // TODO
    return state;
  }

  // Merge new list into existing state. Right now the server record
  // does not produce any interesting information for the client, so
  // the only thing that needs to be "merged" is its existence.
  // Ideally the server could return at least device type/model.
  const existingRecordsByDeviceId = new Map();
  state.DEVICES.devices.forEach((device) => {
    if (device.deviceId) {
      existingRecordsByDeviceId.set(device.deviceId, device);
    }
  });

  const newDevices = action.payload.devices
    .filter((device) => !existingRecordsByDeviceId.has(device.deviceId));
  return {
    ...state,
    DEVICES: {
      type: 'DEVICE_LIST',
      devices: state.DEVICES.devices.concat(newDevices.map((device) => ({
        type: 'DEVICE_STATUS',
        deviceType: '',
        deviceId: device.deviceId,
        accountDeviceNumber: device.accountDeviceNumber,
        deviceConfigId: null,
        deviceConfigStatus: 'CONFIGURED',
        wifiConnectionStatus: null,
        wifiConnectionError: null,
        serverConnectionStatus: null,
        serverConnectionError: null,
        bleConnectionStatus: null,
        bleConnectionError: null,
        rtcConnectionStatus: null,
        rtcConnectionError: null,
      }))),
    },
  };
}

function DEVICE_REGISTERED_UNREGISTER(
  state: MessagesState,
  action: Action<'DEVICE_REGISTERED_UNREGISTER', *, UnregisterRegisteredDeviceResult>
): MessagesState {
  if (action.requested || action.error) {
    return state;
  }

  const {deviceId} = action.payload; // TODO: look at success?
  let {devices} = state.DEVICES;

  const index = devices.findIndex((device) => device.deviceId === deviceId);
  if (index === -1) {
    return state;
  }
  devices = devices.slice();
  devices.splice(index, 1);

  return {
    ...state,
    DEVICES: {
      type: 'DEVICE_LIST',
      devices,
    },
  };
}

function DEVICE_BLE_CONNECTED(
  state: MessagesState,
  action: SimpleAction<'DEVICE_BLE_CONNECTED', DeviceSession>
): MessagesState {
  const session = action.payload;
  let {devices} = state.DEVICES;

  if (session.isRegistered) {
    const {deviceId} = session;
    invariant(deviceId);
    const index = devices.findIndex((device) => device.deviceId === deviceId);
    if (index === -1) {
      return state;
    }
    devices = devices.slice();
    devices[index] = {
      ...devices[index],
      bleConnectionStatus: 'CONNECTED',
    };
  } else {
    const unconfiguredDevice = {
      type: 'DEVICE_STATUS',
      deviceType: '',
      deviceId: null,
      accountDeviceNumber: null,
      deviceConfigId: session.socketId,
      deviceConfigStatus: 'UNCONFIGURED',
      wifiConnectionStatus: 'NOT_CONNECTED',
      wifiConnectionError: null,
      serverConnectionStatus: 'NOT_CONNECTED',
      serverConnectionError: null,
      bleConnectionStatus: 'CONNECTED',
      bleConnectionError: null,
      rtcConnectionStatus: 'NOT_CONNECTED',
      rtcConnectionError: null,
    };
    devices = devices.concat(unconfiguredDevice);
  }

  return {
    ...state,
    DEVICES: {
      type: 'DEVICE_LIST',
      devices,
    },
  };
}

function DEVICE_BLE_DISCONNECTED(
  state: MessagesState,
  action: SimpleAction<'DEVICE_BLE_DISCONNECTED', DeviceSession>
): MessagesState {
  const session = action.payload;
  let {devices} = state.DEVICES;

  if (session.isRegistered) {
    const {deviceId} = session;
    invariant(deviceId);
    const index = devices.findIndex((device) => device.deviceId === deviceId);
    if (index === -1) {
      return state;
    }
    devices = devices.slice();
    devices[index] = {
      ...devices[index],
      bleConnectionStatus: 'NOT_CONNECTED',
    };
  } else {
    const index = devices.findIndex((device) => device.deviceConfigId === session.socketId);
    if (index === -1) {
      return state;
    }
    devices = devices.slice();
    devices.splice(index, 1);
  }

  return {
    ...state,
    DEVICES: {
      type: 'DEVICE_LIST',
      devices,
    },
  };
}

function DEVICE_CONFIG_PROXIMITYGATE(
  state: MessagesState,
  action: SimpleAction<'DEVICE_CONFIG_PROXIMITYGATE', DeviceSession>
): MessagesState {
  const session = action.payload;
  let {devices} = state.DEVICES;
  const index = devices.findIndex((device) => device.deviceConfigId === session.socketId);
  if (index === -1) {
    return state;
  }

  // Set the 'deviceId' property in the device record to indicate that
  // the proximity gate has been passed.
  devices = devices.slice();
  invariant(session.secret);
  devices[index] = {
    ...devices[index],
    deviceId: session.secret.deviceId,
  };
  return {
    ...state,
    DEVICES: {
      type: 'DEVICE_LIST',
      devices,
    },
  };
}

function DEVICE_CONFIG_WIFISCANRESULTS(
  state: MessagesState,
  action: SimpleAction<'DEVICE_CONFIG_WIFISCANRESULTS', DeviceSession>
): MessagesState {
  const session = action.payload;
  invariant(session.wifiNetworks);
  emitter.postMessage({
    type: 'DEVICE_CONFIG_WIFI_NETWORKS',
    deviceConfigId: session.socketId,
    wifiNetworks: session.wifiNetworks,
  });

  // We don't actually change state...
  return state;
}

function DEVICE_CONFIG_STATUSUPDATED(
  state: MessagesState,
  action: SimpleAction<'DEVICE_CONFIG_STATUSUPDATED', DeviceSession>
): MessagesState {
  const session = action.payload;
  let {devices} = state.DEVICES;
  const index = devices.findIndex((device) => device.deviceConfigId === session.socketId);
  if (index === -1) {
    return state;
  }

  const sessionStatus = session.status;
  invariant(sessionStatus);

  const messageComponents = sessionStatus.message.split('_');
  const type = messageComponents.shift();
  const detail = messageComponents.join('_');

  const statusKey = `${type}ConnectionStatus`;
  const errorKey = `${type}ConnectionError`;

  invariant(type === 'wifi' || type === 'server');

  devices = devices.slice();
  const deviceStatusMessage = devices[index];
  if (sessionStatus.isError) {
    deviceStatusMessage[statusKey] = 'NOT_CONNECTED';
    deviceStatusMessage[errorKey] = detail;
  } else {
    let status;

    if (type === 'wifi') {
      if (detail === 'inactive' || detail === 'offline') {
        status = 'NOT_CONNECTED';
      } else if (detail !== 'online') {
        status = 'CONNECTING';
      } else {
        status = 'CONNECTED';
      }
    } else {
      if (detail === 'disconnected') {
        status = 'NOT_CONNECTED';
      } else if (detail !== 'connected') {
        status = 'CONNECTING';
      } else {
        status = 'CONNECTED';
      }
    }

    deviceStatusMessage[statusKey] = status;
    deviceStatusMessage[errorKey] = null;
  }

  return {
    ...state,
    DEVICES: {
      type: 'DEVICE_LIST',
      devices,
    },
  };
}

function DEVICE_CONFIG_REGISTERED(
  state: MessagesState,
  action: SimpleAction<'DEVICE_CONFIG_REGISTERED', DeviceSession>
): MessagesState {
  const session = action.payload;
  let {devices} = state.DEVICES;
  const index = devices.findIndex((device) => device.deviceConfigId === session.socketId);
  if (index === -1) {
    return state;
  }

  const {accountDeviceNumber} = session;
  invariant(accountDeviceNumber);

  // Update the device's configuration status now that's it's registered.
  devices = devices.slice();
  devices[index] = {
    ...devices[index],
    deviceConfigStatus: 'CONFIGURED',
    accountDeviceNumber,
  };
  return {
    ...state,
    DEVICES: {
      type: 'DEVICE_LIST',
      devices,
    },
  };
}


function DEVICE_RTC_SIGNAL(
  state: MessagesState,
  action: Action<'DEVICE_RTC_SIGNAL', string, Peer>
): MessagesState {
  const deviceId = action.input;
  let {devices} = state.DEVICES;
  const index = devices.findIndex((device) => device.deviceId === deviceId);
  if (index === -1) {
    return state;
  }

  devices = devices.slice();
  if (action.requested) {
    devices[index] = {
      ...devices[index],
      rtcConnectionStatus: 'CONNECTING',
      rtcConnectionError: null,
    };
  } else if (action.error) {
    devices[index] = {
      ...devices[index],
      rtcConnectionStatus: 'NOT_CONNECTED',
      rtcConnectionError: action.payload.message, // TODO
    };
  } else {
    devices[index] = {
      ...devices[index],
      rtcConnectionStatus: 'CONNECTED',
      rtcConnectionError: null,
    };
  }

  return {
    ...state,
    DEVICES: {
      type: 'DEVICE_LIST',
      devices,
    },
  };
}

function DEVICE_RTC_CONNECTIONCLOSED(
  state: MessagesState,
  action: SimpleAction<'DEVICE_RTC_CONNECTIONCLOSED', string>
): MessagesState {
  const deviceId = action.payload;
  let {devices} = state.DEVICES;
  const index = devices.findIndex((device) => device.deviceId === deviceId);
  if (index === -1) {
    return state;
  }

  devices = devices.slice();
  devices[index] = {
    ...devices[index],
    rtcConnectionStatus: 'NOT_CONNECTED',
  };
  return {
    ...state,
    DEVICES: {
      type: 'DEVICE_LIST',
      devices,
    },
  };
}


export const reducer = handleActions({
  AUTH_RESTORE: handleAuthAction,
  AUTH_SIGNIN: handleAuthAction,
  AUTH_CREATEACCOUNT: handleAuthAction,
  AUTH_SIGNOUT,
  NETWORK_SERVER_REACHABLE,
  DEVICE_REGISTERED_FETCH,
  DEVICE_REGISTERED_UNREGISTER,
  DEVICE_BLE_CONNECTED,
  DEVICE_BLE_DISCONNECTED,
  DEVICE_CONFIG_PROXIMITYGATE,
  DEVICE_CONFIG_WIFISCANRESULTS,
  DEVICE_CONFIG_STATUSUPDATED,
  DEVICE_CONFIG_REGISTERED,
  DEVICE_RTC_SIGNAL,
  DEVICE_RTC_CONNECTIONCLOSED,
}, initialState);
