/**
 * Machinery to turn Redux actions into the state for App SDK messages.
 *
 * @flow
 */

import invariant from 'assert';
import {handleActions} from 'redux-actions';

import emitter from './emitter';

import type {ListDevicesOutput} from 'silk-api/src/gen/account';
import type {Action, SimpleAction} from 'silk-redux/action';
import type {Peer} from 'silk-rtc';

import type {
  ClientStatusMessage,
  DeviceConnectionDetailsMessage,
  DeviceListMessage,
  DeviceUpdateStatusMessage,
} from './outgoing';
import type DeviceSession from '../ble/device_session';
import type {UnregisterRegisteredDeviceResult} from '../store/device_actions';

export type MessagesState = {
  CLIENT_STATUS: ClientStatusMessage,
  DEVICES: DeviceListMessage,
  CONNECTIONS: Array<DeviceConnectionDetailsMessage>,
  UPDATES: Array<DeviceUpdateStatusMessage>,
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
  CONNECTIONS: [],
  UPDATES: [],
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
        clientConnectionError: null,
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

  const newDevices =
    action.payload.devices.filter(
      (device) => !existingRecordsByDeviceId.has(device.deviceId) &&
                  device.registered
    );
  return {
    ...state,
    DEVICES: {
      ...state.DEVICES,
      devices: state.DEVICES.devices.concat(newDevices.map((device) => ({
        type: 'DEVICE_STATUS',
        deviceType: device.type,
        deviceVersion: null,
        deviceId: device.deviceId,
        accountDeviceNumber: device.accountDeviceNumber,
        deviceConfigId: null,
        deviceConfigStatus: 'CONFIGURED',
        bleConnectionStatus: 'NOT_CONNECTED',
        bleConnectionError: null,
        rtcConnectionStatus: 'NOT_CONNECTED',
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
      ...state.DEVICES,
      devices,
    },
  };
}

function DEVICE_BLE_CONNECTED(
  state: MessagesState,
  action: SimpleAction<'DEVICE_BLE_CONNECTED', DeviceSession>
): MessagesState {
  const session = action.payload;
  const connections = state.CONNECTIONS;
  let {devices} = state.DEVICES;

  if (session.isRegistered) {
    const {deviceId} = session;
    invariant(deviceId);

    const index = devices.findIndex((device) => device.deviceId === deviceId);
    if (index === -1) {
      return state;
    }

    invariant(-1 === connections.findIndex(
      (connection) => connection.deviceId === deviceId
    ));

    devices = devices.slice();
    devices[index] = {
      ...devices[index],
      deviceVersion: session.version,
      bleConnectionStatus: 'CONNECTED',
      bleConnectionError: null,
    };
  } else {
    const unconfiguredDevice = {
      type: 'DEVICE_STATUS',
      deviceType: session.model,
      deviceVersion: session.version,
      deviceId: null,
      accountDeviceNumber: null,
      deviceConfigId: session.socketId,
      deviceConfigStatus: 'UNCONFIGURED',
      bleConnectionStatus: 'CONNECTED',
      bleConnectionError: null,
      rtcConnectionStatus: 'NOT_CONNECTED',
      rtcConnectionError: null,
    };
    devices = [unconfiguredDevice].concat(devices);
  }

  return {
    ...state,
    DEVICES: {
      ...state.DEVICES,
      devices,
    },
  };
}

function DEVICE_BLE_DISCONNECTED(
  state: MessagesState,
  action: SimpleAction<'DEVICE_BLE_DISCONNECTED', DeviceSession>
): MessagesState {
  const session = action.payload;
  let connections = state.CONNECTIONS;
  let {devices} = state.DEVICES;
  let updates = state.UPDATES;

  const oldConnections = connections;
  const oldDevices = devices;
  const oldUpdates = updates;

  if (session.isRegistered) {
    const {deviceId, accountDeviceNumber} = session;
    invariant(deviceId !== null || accountDeviceNumber !== null);
    let index = devices.findIndex((device) => device.deviceId === deviceId);
    if (index === -1) {
      index = devices.findIndex(
        (device) => device.accountDeviceNumber === session.accountDeviceNumber
      );
    }
    if (index !== -1) {
      devices = devices.slice();
      devices[index] = {
        ...devices[index],
        bleConnectionStatus: 'NOT_CONNECTED',
      };
    }
  } else {
    let index = devices.findIndex(
      (device) => device.deviceConfigId === session.socketId
    );
    if (index !== -1) {
      devices = devices.slice();
      devices.splice(index, 1);
    }
  }

  // Remove any connection details for this connection.
  let index = -1;
  if (session.deviceId) {
    index = connections.findIndex(
      (connection) => connection.deviceId === session.deviceId
    );
  }
  if (index !== -1) {
    connections = connections.slice();
    connections.splice(index, 1);
  }

  // Remove any update details for this connection.
  index = -1;
  if (session.deviceId) {
    index = updates.findIndex(
      (update) => update.deviceId === session.deviceId
    );
  }
  if (index !== -1) {
    updates = updates.slice();
    updates.splice(index, 1);
  }

  if (oldConnections === connections &&
      oldDevices === devices &&
      oldUpdates === updates) {
    return state;
  }

  return {
    ...state,
    DEVICES: {
      ...state.DEVICES,
      devices,
    },
    CONNECTIONS: connections,
    UPDATES: updates,
  };
}

function DEVICE_BLE_ERROR(
  state: MessagesState,
  action: SimpleAction<'DEVICE_BLE_ERROR', DeviceSession>
): MessagesState {
  const session = action.payload;
  invariant(session);
  const {error} = session;
  invariant(error);
  let {devices} = state.DEVICES;

  let index = -1;
  if (session.deviceId !== null) {
    index = devices.findIndex((device) => device.deviceId === session.deviceId);
  }
  if (index === -1) {
    index = devices.findIndex(
      (device) => device.deviceConfigId === session.socketId
    );
  }

  // Auth errors can happen before we have a deviceId or deviceConfigId.
  if (index === -1 && session.accountDeviceNumber !== null) {
    index = devices.findIndex(
      (device) => device.accountDeviceNumber === session.accountDeviceNumber
    );
  }

  if (index === -1) {
    return state;
  }

  devices = devices.slice();
  devices[index] = {
    ...devices[index],
    bleConnectionError: error.message,
  };

  return {
    ...state,
    DEVICES: {
      ...state.DEVICES,
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

  let index = devices.findIndex(
    (device) => device.deviceConfigId === session.socketId
  );

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
      ...state.DEVICES,
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

  // We can't check |isRegistered| here because if this session was just
  // just successfully configured then |isRegistered| will now be true and we
  // want to keep sending DEVICE_CONFIG_WIFI_NETWORKS messages.
  if (session.authenticated) {
    invariant(session.deviceId);
    emitter.postMessage({
      type: 'DEVICE_WIFI_NETWORKS',
      deviceId: session.deviceId,
      wifiNetworks: session.wifiNetworks,
    });
  } else {
    emitter.postMessage({
      type: 'DEVICE_CONFIG_WIFI_NETWORKS',
      deviceConfigId: session.socketId,
      wifiNetworks: session.wifiNetworks,
    });
  }

  // We don't actually change state...
  return state;
}

function DEVICE_CONFIG_CONNECTIONSTATUS(
  state: MessagesState,
  action: SimpleAction<'DEVICE_CONFIG_CONNECTIONSTATUS' | 'DEVICE_CONFIG_WIFIINFO', DeviceSession>
): MessagesState {
  const session = action.payload;
  invariant(session.deviceId);

  let connections = state.CONNECTIONS;

  let connection: DeviceConnectionDetailsMessage = {
    type: 'DEVICE_CONNECTION_DETAILS',
    deviceId: session.deviceId,
    wifiStatus: 'NOT_CONNECTED',
    wifiSSID: null,
    wifiLevel: null,
    wifiError: null,
    serverStatus: 'NOT_CONNECTED',
    serverError: null,
  };

  let index = connections.findIndex(
    (connection) => connection.deviceId === session.deviceId
  );
  if (index === -1) {
    connections = connections.concat(connection);
  } else {
    connections = connections.slice();
    connection = {...connections[index]};
    connections[index] = connection;
  }

  const {serverStatus, wifiStatus, wifiInfo} = session;

  if (serverStatus) {
    if (serverStatus.isError) {
      connection.serverStatus = 'NOT_CONNECTED';
      connection.serverError = serverStatus.message;
    } else {
      const {message} = serverStatus;
      if (message === 'disconnected') {
        connection.serverStatus = 'NOT_CONNECTED';
      } else if (message !== 'connected') {
        connection.serverStatus = 'CONNECTING';
      } else {
        connection.serverStatus = 'CONNECTED';
      }
      connection.serverError = null;
    }
  }

  if (wifiStatus) {
    if (wifiStatus.isError) {
      connection.wifiStatus = 'NOT_CONNECTED';
      connection.wifiError = wifiStatus.message;
    } else {
      const {message} = wifiStatus;
      if (message === 'inactive' || message === 'offline') {
        connection.wifiStatus = 'NOT_CONNECTED';
      } else if (message !== 'online') {
        connection.wifiStatus = 'CONNECTING';
      } else {
        connection.wifiStatus = 'CONNECTED';
      }
      connection.wifiError = null;
    }
  }

  if (wifiInfo) {
    connection.wifiSSID = wifiInfo.ssid;
    connection.wifiLevel = wifiInfo.level;
  }

  return {
    ...state,
    CONNECTIONS: connections,
  };
}

function DEVICE_CONFIG_UPDATESTATUS(
  state: MessagesState,
  action: SimpleAction<'DEVICE_CONFIG_UPDATESTATUS', DeviceSession>
): MessagesState {
  const session = action.payload;
  invariant(session.deviceId);


  const {updateStatus} = session;
  invariant(updateStatus);

  let updates = state.UPDATES;

  const update: DeviceUpdateStatusMessage = {
    type: 'DEVICE_UPDATE_STATUS',
    deviceId: session.deviceId,
    state: updateStatus.state,
    progress: updateStatus.progress || null,
    error: updateStatus.error || null,
  };

  const index = updates.findIndex((u) => u.deviceId === session.deviceId);
  if (index === -1) {
    updates = updates.concat(update);
  } else {
    updates = updates.slice();
    updates[index] = update;
  }

  return {
    ...state,
    UPDATES: updates,
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
      ...state.DEVICES,
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
      ...state.DEVICES,
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
      ...state.DEVICES,
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
  DEVICE_BLE_ERROR,
  DEVICE_CONFIG_PROXIMITYGATE,
  DEVICE_CONFIG_WIFISCANRESULTS,
  DEVICE_CONFIG_WIFIINFO: DEVICE_CONFIG_CONNECTIONSTATUS,
  DEVICE_CONFIG_CONNECTIONSTATUS,
  DEVICE_CONFIG_UPDATESTATUS,
  DEVICE_CONFIG_REGISTERED,
  DEVICE_RTC_SIGNAL,
  DEVICE_RTC_CONNECTIONCLOSED,
}, initialState);
