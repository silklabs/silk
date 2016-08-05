/**
 * @flow
 */

import invariant from 'assert';
import {handleActions} from 'redux-actions';

import type {ListDevicesOutput} from 'silk-api/src/gen/account';
import type {Peer} from 'silk-rtc';

import type {Action, SimpleAction} from './action';
import type {
  DeviceSession,
  DeviceSecret,
  DeviceStatus,
} from '../ble/device_manager';
import type {
  UnregisterRegisteredDeviceResult,
  RegisterConfiguringDeviceResult,
  ConfiguringDeviceProximityGate,
  ConfiguringDeviceStatusUpdate,
  ConfiguringDeviceError,
} from './device_actions';

type RegisteredDevice = {
  deviceId: string;
  publicKey: string;
  name: string;
  rtcConnection: ?Peer;
  bleDeviceSession: ?DeviceSession,

  // Legacy state that we currently get via socket.io
  previewSize: ?{width: number; height: number};
  haveVideoStream: boolean,
};

export type DevicesState = {
  /**
   * Map deviceId to RegisteredDevice records. null indicates we
   * haven't been able to determine this list yet.
   */
  registered: ?Map<string, RegisteredDevice>;

  /**
   * Map socket ID (which is locally -- to this client -- and
   * tmeporarily -- for the runtime of the app -- unique) to a
   * DeviceSession object.
   */
  unregistered: Map<number, DeviceSession>;

  configuring: ?{
    socketId: number;
    passedProximityGate: boolean;
    secret: ?DeviceSecret;
    serverRegistrationResult: ?RegisterConfiguringDeviceResult;
    status: ?DeviceStatus;
    error: ?Error;
    registered: boolean;
  };
};

const initialState: DevicesState = {
  registered: null,
  unregistered: new Map(),
  configuring: null,
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
      ...storedRecord,
      rtcConnection: null,
      bleDeviceSession: null,
      // Legacy socket.io
      previewSize: null,
      haveVideoStream: false,
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
        ...serverRecord,
        rtcConnection: null,
        bleDeviceSession: null,
        // Legacy socket.io
        previewSize: null,
        haveVideoStream: false,
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
  invariant(state.registered);
  invariant(state.registered.get(deviceId));

  const registered = new Map(state.registered);
  registered.delete(deviceId);
  return {
    ...state,
    registered,
  };
}


// Unregistered devices

function DEVICE_UNREGISTERED_CONNECTED(
  state: DevicesState,
  action: SimpleAction<'DEVICE_UNREGISTERED_CONNECTED', DeviceSession>
): DevicesState {
  const session = action.payload;
  invariant(!state.unregistered.has(session.socketId));
  const unregistered = new Map(state.unregistered);
  unregistered.set(session.socketId, session);
  return {
    ...state,
    unregistered,
  };
}

function DEVICE_UNREGISTERED_DISCONNECTED(
  state: DevicesState,
  action: SimpleAction<'DEVICE_UNREGISTERED_DISCONNECTED', DeviceSession>
): DevicesState {
  const session = action.payload;
  invariant(state.unregistered.has(session.socketId));
  const unregistered = new Map(state.unregistered);
  unregistered.delete(session.socketId);

  let {configuring} = state;
  if (configuring &&
      configuring.socketId === session.socketId &&
      !configuring.registered) {
    configuring = {
      ...configuring,
      error: new Error('BLE socket disconnected before'),
    };
  }

  return {
    ...state,
    unregistered,
    configuring,
  };
}

function DEVICE_UNREGISTERED_ACCEPTED(
  state: DevicesState,
  action: SimpleAction<'DEVICE_UNREGISTERED_ACCEPTED', DeviceSession>
): DevicesState {
  // We currently only support 1 configuring device.
  invariant(!state.configuring);
  const session = action.payload;
  return {
    ...state,
    configuring: {
      socketId: session.socketId,
      passedProximityGate: false,
      secret: null,
      serverRegistrationResult: null,
      status: null,
      error: null,
      registered: false,
    },
  };
}


// Currently configuring device

function DEVICE_CONFIGURING_ABORTED(
  state: DevicesState,
  action: SimpleAction<'DEVICE_CONFIGURING_ABORTED', DeviceSession>
): DevicesState {
  return {
    ...state,
    configuring: null,
  };
}

function DEVICE_CONFIGURING_PROXIMITYGATE(
  state: DevicesState,
  action: SimpleAction<'DEVICE_CONFIGURING_PROXIMITYGATE', ConfiguringDeviceProximityGate>
): DevicesState {
  const {socketId, secret} = action.payload;
  const {configuring} = state;
  invariant(configuring);
  invariant(configuring.socketId === socketId);
  invariant(!configuring.secret);
  return {
    ...state,
    configuring: {
      ...configuring,
      secret,
    },
  };
}

function DEVICE_CONFIGURING_STATUSUPDATED(
  state: DevicesState,
  action: SimpleAction<'DEVICE_CONFIGURING_STATUSUPDATED', ConfiguringDeviceStatusUpdate>
): DevicesState {
  const {socketId, status} = action.payload;
  const {configuring} = state;
  invariant(configuring);
  invariant(configuring.socketId === socketId);
  return {
    ...state,
    configuring: {
      ...configuring,
      status,
    },
  };
}

function DEVICE_CONFIGURING_REGISTERSERVER(
  state: DevicesState,
  action: Action<'DEVICE_CONFIGURING_REGISTERSERVER', *, RegisterConfiguringDeviceResult>
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

function DEVICE_CONFIGURING_REGISTERED(
  state: DevicesState,
  action: SimpleAction<'DEVICE_CONFIGURING_REGISTERED', DeviceSession>
): DevicesState {
  const {configuring} = state;
  const session = action.payload;
  invariant(configuring);
  invariant(configuring.socketId === session.socketId);
  return {
    ...state,
    configuring: {
      ...configuring,
      registered: true,
    },
  };
}

function DEVICE_CONFIGURING_ERROR(
  state: DevicesState,
  action: SimpleAction<'DEVICE_CONFIGURING_ERROR', ConfiguringDeviceError>
): DevicesState {
  const {socketId, error} = action.payload;
  const {configuring} = state;
  invariant(configuring);
  invariant(configuring.socketId === socketId);
  return {
    ...state,
    configuring: {
      ...configuring,
      error,
    },
  };
}

function DEVICE_CONFIGURING_FINISH(
  state: DevicesState,
  action: SimpleAction<'DEVICE_CONFIGURING_FINISH', void>
): DevicesState {
  const {configuring} = state;
  invariant(configuring);
  invariant(configuring.registered);
  invariant(configuring.secret);
  invariant(configuring.serverRegistrationResult);

  const {deviceId} = configuring.secret;
  const registered = new Map(state.registered);
  registered.set(deviceId, {
    deviceId,
    publicKey: deviceId,
    name: configuring.serverRegistrationResult.name,
    rtcConnection: null,
    // We don't count the unauthenticated BLE session that we're using
    // to configure the device here.
    bleDeviceSession: null,
    previewSize: null,
    haveVideoStream: false,
  });
  return {
    ...state,
    configuring: null,
    registered,
  };
}

export const reducer = handleActions({
  DEVICE_REGISTERED_RESTORE,
  DEVICE_REGISTERED_FETCH,
  DEVICE_REGISTERED_UNREGISTER,
  DEVICE_UNREGISTERED_CONNECTED,
  DEVICE_UNREGISTERED_DISCONNECTED,
  DEVICE_UNREGISTERED_ACCEPTED,
  DEVICE_UNREGISTERED_DECLINED: DEVICE_UNREGISTERED_DISCONNECTED,
  DEVICE_CONFIGURING_ABORTED,
  DEVICE_CONFIGURING_PROXIMITYGATE,
  DEVICE_CONFIGURING_REGISTERSERVER,
  DEVICE_CONFIGURING_STATUSUPDATED,
  DEVICE_CONFIGURING_REGISTERED,
  DEVICE_CONFIGURING_ERROR,
  DEVICE_CONFIGURING_FINISH,
}, initialState);
