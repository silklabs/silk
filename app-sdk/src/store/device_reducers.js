/**
 * @flow
 */

import invariant from 'assert';
import {handleActions} from 'redux-actions';

import type {ListDevicesOutput} from 'silk-api/src/gen/account';
import type {Action, SimpleAction} from 'silk-redux/action';
import type {Peer} from 'silk-rtc';

import type {
  default as DeviceSession,
  DeviceSecret,
  DeviceStatus,
  RegistrationInformation,
} from '../ble/device_session';
import type {
  DeviceConfig,
  UnregisterRegisteredDeviceResult,
  RegisterConfiguringDeviceResult,
} from './device_actions';

export type RegisteredDevice = {
  deviceId: string;
  publicKey: string;
  accountDeviceNumber: number;
  name: string;
  type: string;
  rtc: {
    connecting: boolean,
    peer: ?Peer,
    error: ?Error,
  },
  ble: {
    connectionRequested: boolean,
    session: ?DeviceSession,
  },
};

export type DevicesState = {
  /**
   * Map deviceId to RegisteredDevice records. null indicates we
   * haven't been able to determine this list yet.
   */
  registered: ?Map<string, RegisteredDevice>;

  /**
   * Map socket ID (which is locally -- to this client -- and
   * temporarily -- for the runtime of the app -- unique) to a
   * DeviceSession object.
   */
  unconfigured: Map<number, DeviceSession>;

  configuring: ?{
    socketId: number;
    passedProximityGate: boolean;
    secret: ?DeviceSecret;
    config: ?DeviceConfig;
    serverRegistrationResult: ?RegisterConfiguringDeviceResult;
    wifiStatus: ?DeviceStatus;
    serverStatus: ?DeviceStatus;
    error: ?Error;
    registered: boolean;
  };
};

const initialState: DevicesState = {
  registered: null,
  unconfigured: new Map(),
  configuring: null,
};

const registeredDeviceTemplate = {
  rtc: {
    connecting: false,
    peer: null,
    error: null,
  },
  ble: {
    connectionRequested: false,
    session: null,
  },
};

// Registered devices

function DEVICE_REGISTERED_RESTORE(
  state: DevicesState,
  action: Action<'DEVICE_REGISTERED_RESTORE', void, ?ListDevicesOutput>
): DevicesState {
  if (action.requested) {
    return state;
  }
  if (action.error) {
    // TODO: anything we want to do here?
    return state;
  }

  // We're assuming that we're the first to populate this field.
  invariant(state.registered === null);

  if (!action.payload) {
    return state;
  }

  const {devices} = action.payload;
  const registered = new Map();
  devices.forEach((storedRecord) => {
    const device = {
      ...registeredDeviceTemplate,
      ...storedRecord,
    };
    registered.set(device.deviceId, device);
  });
  return {
    ...state,
    registered,
  };
}

function DEVICE_REGISTERED_FETCH(
  state: DevicesState,
  action: Action<'DEVICE_REGISTERED_FETCH', void, ListDevicesOutput>
): DevicesState {
  if (action.requested) {
    return state;
  }
  if (action.error) {
    // TODO: anything we want to do here?
    return state;
  }

  const {devices} = action.payload;
  const registered = new Map();
  devices.forEach((serverRecord) => {
    if (!serverRecord.registered) {
      return;
    }
    let device = null;
    if (state.registered) {
      device = state.registered.get(serverRecord.deviceId);
    }
    if (device) {
      device = {
        ...device,
        ...serverRecord,
      };
    } else {
      device = {
        ...registeredDeviceTemplate,
        ...serverRecord,
      };
    }
    registered.set(device.deviceId, device);
  });

  return {
    ...state,
    registered,
  };
}

function DEVICE_REGISTERED_UNREGISTER(
  state: DevicesState,
  action: Action<'DEVICE_REGISTERED_UNREGISTER', *, UnregisterRegisteredDeviceResult>
): DevicesState {
  if (action.requested || action.error) {
    // TODO: anything we want to do here? Could optimistically remove
    // the device from state, but then we'd have to add it back if the
    // action fails...
    return state;
  }

  const {deviceId} = action.payload;
  // TODO: look at success?
  if (!state.registered || !state.registered.has(deviceId)) {
    return state;
  }

  const registered = new Map(state.registered);
  registered.delete(deviceId);
  return {
    ...state,
    registered,
  };
}


// BLE connections

function DEVICE_BLE_CONNECT(
  state: DevicesState,
  action: SimpleAction<'DEVICE_BLE_CONNECT', string>
): DevicesState {
  const deviceId = action.payload;
  invariant(deviceId);
  if (!state.registered || !state.registered.has(deviceId)) {
    return state;
  }
  const registered = new Map(state.registered);
  const device = registered.get(deviceId);
  invariant(device);
  registered.set(deviceId, {
    ...device,
    ble: {
      ...device.ble,
      connectionRequested: true,
    },
  });
  return {
    ...state,
    registered,
  };
}

function DEVICE_BLE_DISCONNECT(
  state: DevicesState,
  action: SimpleAction<'DEVICE_BLE_DISCONNECT', string>
): DevicesState {
  const deviceId = action.payload;
  invariant(deviceId);
  if (!state.registered || !state.registered.has(deviceId)) {
    return state;
  }
  const registered = new Map(state.registered);
  const device = registered.get(deviceId);
  invariant(device);
  registered.set(deviceId, {
    ...device,
    ble: {
      ...device.ble,
      connectionRequested: false,
    },
  });
  return {
    ...state,
    registered,
  };
}

function DEVICE_BLE_CONNECTED(
  state: DevicesState,
  action: SimpleAction<'DEVICE_BLE_CONNECTED', DeviceSession>
): DevicesState {
  const session = action.payload;
  if (!session.isRegistered) {
    invariant(!state.unconfigured.has(session.socketId));
    const unconfigured = new Map(state.unconfigured);
    unconfigured.set(session.socketId, session);
    return {
      ...state,
      unconfigured,
    };
  }

  const {accountDeviceNumber, deviceId} = session;
  invariant(accountDeviceNumber);
  invariant(deviceId);
  if (!state.registered || !state.registered.has(deviceId)) {
    return state;
  }
  const registered = new Map(state.registered);
  const device = registered.get(deviceId);
  invariant(device);
  invariant(!device.ble.session);
  registered.set(deviceId, {
    ...device,
    accountDeviceNumber,
    ble: {
      ...device.ble,
      session,
    },
  });
  return {
    ...state,
    registered,
  };
}

function DEVICE_BLE_DISCONNECTED(
  state: DevicesState,
  action: SimpleAction<'DEVICE_BLE_DISCONNECTED' | 'DEVICE_CONFIG_DECLINE', DeviceSession>
): DevicesState {
  const session = action.payload;
  let {registered, unconfigured, configuring} = state;

  if (unconfigured.has(session.socketId)) {
    unconfigured = new Map(unconfigured);
    unconfigured.delete(session.socketId);
  } else if (session.deviceId) {
    const {deviceId} = session;
    if (state.registered && state.registered.has(deviceId)) {
      registered = new Map(registered);
      const device = registered.get(deviceId);
      invariant(device);
      invariant(device.ble.session === session);
      registered.set(deviceId, {
        ...device,
        ble: {
          ...device.ble,
          session: null,
        },
      });
    }
  }

  if (configuring &&
      configuring.socketId === session.socketId &&
      !configuring.registered) {
    configuring = {
      ...configuring,
      error: new Error('BLE socket disconnected before config completed.'),
    };
  }

  return {
    ...state,
    registered,
    unconfigured,
    configuring,
  };
}

function DEVICE_BLE_ERROR(
  state: DevicesState,
  action: SimpleAction<'DEVICE_BLE_ERROR', DeviceSession>
): DevicesState {
  const session = action.payload;
  const {configuring} = state;
  if (!configuring || configuring.socketId !== session.socketId) {
    return state;
  }
  return {
    ...state,
    configuring: {
      ...configuring,
      error: session.error,
    },
  };
}

// Device configuration

function DEVICE_CONFIG_ACCEPT(
  state: DevicesState,
  action: Action<'DEVICE_CONFIG_ACCEPT', number, DeviceSession>
): DevicesState {
  invariant(!action.requested && !action.error);
  const session = action.payload;
  invariant(!state.configuring);
  invariant(!session.isRegistered);
  invariant(session.model);
  return {
    ...state,
    configuring: {
      socketId: session.socketId,
      passedProximityGate: false,
      secret: null,
      config: null,
      serverRegistrationResult: null,
      wifiStatus: null,
      serverStatus: null,
      error: null,
      registered: false,
    },
  };
}

function DEVICE_CONFIG_ABORT(
  state: DevicesState,
  action: SimpleAction<'DEVICE_CONFIG_ABORT', DeviceSession>
): DevicesState {
  const session = action.payload;
  invariant(state.configuring);
  invariant(state.configuring.socketId === session.socketId);
  return {
    ...state,
    configuring: null,
  };
}

function DEVICE_CONFIG_PROXIMITYGATE(
  state: DevicesState,
  action: SimpleAction<'DEVICE_CONFIG_PROXIMITYGATE', DeviceSession>
): DevicesState {
  const session = action.payload;
  const {configuring} = state;
  invariant(configuring);
  invariant(configuring.socketId === session.socketId);
  return {
    ...state,
    configuring: {
      ...configuring,
      passedProximityGate: true,
      secret: session.secret,
    },
  };
}

function DEVICE_CONFIG_SETCONFIG(
  state: DevicesState,
  action: SimpleAction<'DEVICE_CONFIG_SETCONFIG', DeviceConfig>
): DevicesState {
  const config = action.payload;
  const {configuring} = state;
  invariant(configuring);
  return {
    ...state,
    configuring: {
      ...configuring,
      config,
    },
  };
}

function DEVICE_CONFIG_REGISTERSERVER(
  state: DevicesState,
  action: Action<'DEVICE_CONFIG_REGISTERSERVER', *, RegisterConfiguringDeviceResult>
): DevicesState {
  if (action.requested) {
    return state;
  }

  if (action.error) {
    return {
      ...state,
      configuring: {
        ...state.configuring,
        error: action.payload,
      },
    };
  }

  const serverRegistrationResult = action.payload;
  if (!serverRegistrationResult.success) {
    return {
      ...state,
      configuring: {
        ...state.configuring,
        error: new Error('Could not register device with the server.'),
      },
    };
  }

  return {
    ...state,
    configuring: {
      ...state.configuring,
      serverRegistrationResult,
    },
  };
}

function DEVICE_CONFIG_SENDCONFIG(
  state: DevicesState,
  action: Action<'DEVICE_CONFIG_SENDCONFIG', RegistrationInformation, DeviceSession>
): DevicesState {
  invariant(!action.requested && !action.error);
  // Nothing to do here.
  return state;
}

function DEVICE_CONFIG_CONNECTIONSTATUS(
  state: DevicesState,
  action: SimpleAction<'DEVICE_CONFIG_CONNECTIONSTATUS', DeviceSession>
): DevicesState {
  const session = action.payload;
  const {configuring} = state;

  // We may receive status updates even after successful config while the device
  // tries to connect to the server.
  if (!configuring) {
    return state;
  }

  invariant(configuring.socketId === session.socketId);

  const {wifiStatus, serverStatus} = session;

  return {
    ...state,
    configuring: {
      ...configuring,
      wifiStatus,
      serverStatus,
    },
  };
}

function DEVICE_CONFIG_REGISTERED(
  state: DevicesState,
  action: SimpleAction<'DEVICE_CONFIG_REGISTERED', DeviceSession>
): DevicesState {
  const session = action.payload;
  invariant(session.isRegistered);
  invariant(session.deviceId);
  const {configuring, registered, unconfigured} = state;
  if (!configuring || configuring.socketId !== session.socketId) {
    invariant(registered);
    const device = registered.get(session.deviceId);
    invariant(device);
    invariant(device.ble.session === session);
    invariant(session.authenticated);
    return state;
  }
  invariant(unconfigured.has(session.socketId));
  return {
    ...state,
    configuring: {
      ...configuring,
      registered: true,
    },
  };
}

function DEVICE_CONFIG_FINISH(
  state: DevicesState,
  action: SimpleAction<'DEVICE_CONFIG_FINISH', void>
): DevicesState {
  const {configuring} = state;
  invariant(configuring);
  invariant(configuring.registered || configuring.error);

  if (configuring.error) {
    return {
      ...state,
      configuring: null,
    };
  }

  let {unconfigured} = state;
  invariant(unconfigured.has(configuring.socketId));

  const session = unconfigured.get(configuring.socketId);
  invariant(session);

  unconfigured = new Map(unconfigured);
  unconfigured.delete(configuring.socketId);

  invariant(configuring.secret);
  invariant(configuring.serverRegistrationResult);

  const {name, type} = configuring.serverRegistrationResult;
  invariant(name);
  invariant(type);

  const accountDeviceNumber = session.accountDeviceNumber;
  invariant(accountDeviceNumber);

  const {deviceId} = configuring.secret;
  const registered = new Map(state.registered);
  registered.set(deviceId, {
    deviceId,
    publicKey: deviceId,
    name,
    type,
    accountDeviceNumber,
    ...registeredDeviceTemplate,
    ble: {
      ...registeredDeviceTemplate.ble,
      session,
    },
  });

  return {
    ...state,
    configuring: null,
    registered,
    unconfigured,
  };
}


// WebRTC

function DEVICE_RTC_SIGNAL(
  state: DevicesState,
  action: Action<'DEVICE_RTC_SIGNAL', string, Peer>
): DevicesState {
  const deviceId = action.input;
  let {registered} = state;
  if (!registered) {
    return state;
  }

  let device = registered.get(deviceId);
  if (!device) {
    return state;
  }

  if (action.requested) {
    device = {
      ...device,
      rtc: {
        connecting: true,
        peer: null,
        error: null,
      },
    };
  } else if (action.error) {
    device = {
      ...device,
      rtc: {
        connecting: false,
        peer: null,
        error: action.payload,
      },
    };
  } else {
    device = {
      ...device,
      rtc: {
        connecting: false,
        peer: action.payload,
        error: null,
      },
    };
  }
  registered = new Map(registered);
  registered.set(deviceId, device);
  return {
    ...state,
    registered,
  };
}

function DEVICE_RTC_CONNECTIONCLOSED(
  state: DevicesState,
  action: SimpleAction<'DEVICE_RTC_CONNECTIONCLOSED', string>
): DevicesState {
  const deviceId = action.payload;
  if (!state.registered || !state.registered.has(deviceId)) {
    return state;
  }

  const registered = new Map(state.registered);
  const device = state.registered.get(deviceId);
  registered.set(deviceId, {
    ...device,
    rtc: {
      connecting: false,
      peer: null,
      error: null,
    },
  });
  return {
    ...state,
    registered,
  };
}


function AUTH_SIGNOUT(
  state: DevicesState,
  action: Action<'AUTH_SIGNOUT', void>
): DevicesState {
  const {registered} = state;
  if (registered) {
    registered.forEach((device) => {
      if (device.rtc.peer) {
        device.rtc.peer.destroy();
      }
    });
  }
  return {
    ...initialState,
  };
}

export const reducer = handleActions({
  DEVICE_REGISTERED_RESTORE,
  DEVICE_REGISTERED_FETCH,
  DEVICE_REGISTERED_UNREGISTER,
  DEVICE_BLE_CONNECT,
  DEVICE_BLE_DISCONNECT,
  DEVICE_BLE_CONNECTED,
  DEVICE_BLE_DISCONNECTED,
  DEVICE_BLE_ERROR,
  DEVICE_CONFIG_ACCEPT,
  DEVICE_CONFIG_DECLINE: DEVICE_BLE_DISCONNECTED,
  DEVICE_CONFIG_ABORT,
  DEVICE_CONFIG_PROXIMITYGATE,
  DEVICE_CONFIG_SETCONFIG,
  DEVICE_CONFIG_REGISTERSERVER,
  DEVICE_CONFIG_SENDCONFIG,
  DEVICE_CONFIG_CONNECTIONSTATUS,
  DEVICE_CONFIG_REGISTERED,
  DEVICE_CONFIG_FINISH,
  DEVICE_RTC_SIGNAL,
  DEVICE_RTC_CONNECTIONCLOSED,
  AUTH_SIGNOUT,
}, initialState);
