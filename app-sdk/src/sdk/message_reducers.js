/**
 * Machinery to turn Redux actions into the state for App SDK messages.
 *
 * @flow
 */

import invariant from 'assert';
import {handleActions} from 'redux-actions';

import type {ListDevicesOutput} from 'silk-api/src/gen/account';

import type {Action} from '../store/action';
import type {ClientStatusMessage} from './client_status';
import type {DeviceListMessage} from './devices';

export type MessagesState = {
  CLIENT_STATUS: ClientStatusMessage,
  DEVICES: DeviceListMessage,
};

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
  action: Action<'AUTH_RESTORE' | 'AUTH_SIGNIN' | 'AUTH_CREATEACCOUNT', boolean>
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
  action: Action<'AUTH_SIGNOUT', boolean>
): MessagesState {
  if (action.requested) {
    return state;
  }
  if (action.error) {
    // Ignore.
  }
  return {
    ...state,
    CLIENT_STATUS: {
      ...state.CLIENT_STATUS,
      clientAuthStatus: 'NOT_AUTHENTICATED',
      clientAuthError: null,
    },
  };
}

function NETWORK_SERVER_REACHABLE(
  state: MessagesState,
  action: Action<'NETWORK_SERVER_REACHABLE', boolean>
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

function DEVICE_LIST_FETCH(
  state: MessagesState,
  action: Action<'DEVICE_LIST_FETCH', ListDevicesOutput>
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

export const reducer = handleActions({
  AUTH_RESTORE: handleAuthAction,
  AUTH_SIGNIN: handleAuthAction,
  AUTH_CREATEACCOUNT: handleAuthAction,
  AUTH_SIGNOUT,
  NETWORK_SERVER_REACHABLE,
  DEVICE_LIST_FETCH,
}, initialState);
