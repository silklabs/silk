/**
 * @flow
 */

/* global MediaStream */

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
  RTCMediaStreamResult,
} from './device_actions';

export type RegisteredDevice = {
  deviceId: string;
  publicKey: string;
  accountDeviceNumber: number;
  name: string;
  type: string;
  lastSeenAt: number;
  registeredAt: number;

  rtc: {
    /**
     * Indicates that we're in the process of signaling the device
     * currently. Once successfully connected to the device, this will
     * be `false` again and the `peer` member below will be non-null.
     */
    connecting: boolean;

    /**
     * The Peer object representing the WebRTC connection. Whenever
     * we're connected to a device via WebRTC, this will be non-null.
     */
    peer: ?Peer;

    /**
     * If the last connection attempt failed, this will be non-null
     * and contain the corresponding error object. It will be cleared
     * as soon as the next connection attempt is made.
     */
    error: ?Error;

    /**
     * Flag that indicates that a prior connection attempt failed due
     * to not being authorized with the device. This flag does not get
     * cleared by subsequent connection attempts. It typically is only
     * cleared after authorizing with the device over BLE.
     */
    unauthorized: boolean;

    /**
     * Counts the number of connection attempts made.
     */
    attempts: number;

    /**
     * Flag that indicates that whenever we're connected to the
     * device, it should send the preview stream.
     */
    previewEnabled: boolean;

    /**
     * The preview stream, when available.
     */
    previewStream: ?MediaStream;

    /**
     * Flag that indicates that whenever we're connected to the
     * device, it should send the full format live stream.
     */
    videoEnabled: boolean;

    /**
     * The video stream, when available.
     */
    videoStream: ?MediaStream;
  };

  ble: {
    /**
     * Flag to indicate that we want to be connected to the device via BLE.
     */
    connectionRequested: boolean;

    /**
     * The BLE session object representing the BLE connection to the
     * device. Whenever we're connected to a device via BLE, this will
     * be non-null.
     */
    session: ?DeviceSession;

    /**
     * Flag to indicate whether we're recognized by the device as an
     * authorized app. This flag will be `true` if we've never been
     * authorized by the device (e.g. performed BLE pairing). It will
     * flip to `false` once the proximity gate has been crossed and
     * the pairing has been performed. It will be `null` for
     * connections that are already authorized.
     */
    unauthorized: ?boolean;
  };

  /**
   * This object is added to the state to track the progress of
   * removing a device from the account.
   */
  unregister: ?{
    /**
     * Signed message (onion) for the device to factory-reset itself.
     */
    factoryResetMessage: ?string;

    /**
     * Flag to indicate whether an attempt to notify the device has
     * been made. `false` means the factory-reset message hasn't been
     * sent, `true` means it was sent successfully or sending failed.
     */
    peerNotified: boolean;

    /**
     * Flag indicating the status of notifying the server. `null`
     * means the server hasn't been contacted yet, `false` means the
     * operation is in progress, `true` means the operation is complete.
     */
    serverStatus: ?boolean;

    /**
     * Flag to indicate whther notifying the server was successful.
     */
    serverFailure: boolean;
  };
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
    unauthorized: false,
    attempts: 0,
    previewEnabled: false,
    previewStream: null,
    videoEnabled: false,
    videoStream: null,
  },
  ble: {
    connectionRequested: false,
    session: null,
    unauthorized: null,
  },
  unregister: null,
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
    const {lastSeenAt, registeredAt, ...deviceProps} = storedRecord;
    invariant(registeredAt);

    const device = {
      ...registeredDeviceTemplate,
      ...deviceProps,
      lastSeenAt: new Date(lastSeenAt).getTime(),
      registeredAt: new Date(registeredAt).getTime(),
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

    const {lastSeenAt, registeredAt, ...deviceProps} = serverRecord;
    invariant(registeredAt);

    const dates = {
      lastSeenAt: new Date(lastSeenAt).getTime(),
      registeredAt: new Date(registeredAt).getTime(),
    };

    if (device) {
      device = {
        ...device,
        ...deviceProps,
        ...dates,
      };
    } else {
      device = {
        ...registeredDeviceTemplate,
        ...deviceProps,
        ...dates,
      };
    }

    registered.set(device.deviceId, device);
  });

  return {
    ...state,
    registered,
  };
}

function DEVICE_REGISTERED_UNREGISTER_BEGIN(
  state: DevicesState,
  action: Action<'DEVICE_REGISTERED_UNREGISTER_BEGIN', string, string>
): DevicesState {
  if (action.error) {
    // XXX How to handle this?
    return state;
  }

  if (!state.registered) {
    return state;
  }

  const {input: deviceId} = action;
  const oldDevice = state.registered.get(deviceId);
  if (!oldDevice) {
    return state;
  }

  const registered = new Map(state.registered);

  if (action.requested) {
    registered.set(deviceId, {
      ...oldDevice,
      unregister: {
        factoryResetMessage: null,
        peerNotified: false,
        serverStatus: null,
        serverFailure: false,
      },
    });
    return {
      ...state,
      registered,
    };
  }

  registered.set(deviceId, {
    ...oldDevice,
    unregister: {
      ...oldDevice.unregister,
      factoryResetMessage: action.payload,
    },
  });

  return {
    ...state,
    registered,
  };
}

function DEVICE_REGISTERED_UNREGISTER_PEER(
  state: DevicesState,
  action: Action<'DEVICE_REGISTERED_UNREGISTER_PEER', string, void>
): DevicesState {
  if (!state.registered) {
    return state;
  }

  const {input: deviceId} = action;
  const oldDevice = state.registered.get(deviceId);
  if (!oldDevice) {
    return state;
  }

  invariant(oldDevice.unregister);

  const registered = new Map(state.registered);
  registered.set(deviceId, {
    ...oldDevice,
    unregister: {
      ...oldDevice.unregister,
      peerNotified: true,
    },
  });

  return {
    ...state,
    registered,
  };
}

function DEVICE_REGISTERED_UNREGISTER_SERVER(
  state: DevicesState,
  action: Action<'DEVICE_REGISTERED_UNREGISTER_SERVER', string, UnregisterRegisteredDeviceResult>
): DevicesState {
  if (!state.registered) {
    return state;
  }

  const {input: deviceId} = action;
  const oldDevice = state.registered.get(deviceId);
  if (!oldDevice) {
    return state;
  }

  invariant(oldDevice.unregister);

  const registered = new Map(state.registered);

  if (action.requested) {
    registered.set(deviceId, {
      ...oldDevice,
      unregister: {
        ...oldDevice.unregister,
        serverStatus: false,
      },
    });
  } else if (action.error || !action.payload.success) {
    registered.set(deviceId, {
      ...oldDevice,
      unregister: {
        ...oldDevice.unregister,
        serverFailure: true,
      },
    });
  } else {
    registered.delete(deviceId);
  }

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

  let {registered} = state;
  if (!registered) {
    return state;
  }

  const {accountDeviceNumber} = session;
  invariant(accountDeviceNumber);

  let {deviceId} = session;
  if (!deviceId) {
    // No deviceId, so it must be an unauthorized session. Try to find
    // out which device it belongs to.
    invariant(session.isUnauthorized);
    for (let device of registered.values()) {
      if (device.accountDeviceNumber === accountDeviceNumber) {
        deviceId = device.deviceId;
        break;
      }
    }
  }

  if (!deviceId || !registered.has(deviceId)) {
    return state;
  }

  registered = new Map(registered);
  const device = registered.get(deviceId);
  invariant(device);
  invariant(!device.ble.session);
  registered.set(deviceId, {
    ...device,
    accountDeviceNumber,
    ble: {
      ...device.ble,
      session,
      unauthorized: session.isUnauthorized,
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
          unauthorized: null,
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
  action: SimpleAction<'DEVICE_CONFIG_ABORT', ?DeviceSession>
): DevicesState {
  const session = action.payload;
  invariant(state.configuring);
  if (session) {
    invariant(state.configuring.socketId === session.socketId);
  }
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
  const {configuring, unconfigured} = state;
  let {registered} = state;
  if (!configuring || configuring.socketId !== session.socketId) {
    invariant(registered);
    const device = registered.get(session.deviceId);
    invariant(device);
    invariant(device.ble.session === session);
    invariant(session.authenticated);

    if (!device.ble.unauthorized) {
      return state;
    }

    // We just paired with a device that we were previously not
    // authorized with.
    registered = new Map(registered);
    registered.set(device.deviceId, {
      ...device,
      ble: {
        ...device.ble,
        unauthorized: false,
      },
    });
    return {
      ...state,
      registered,
    };
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
  const now = Date.now();

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
    lastSeenAt: now,
    registeredAt: now,
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
        ...device.rtc,
        connecting: true,
        peer: null,
        error: null,
      },
    };
  } else if (action.error) {
    const isUnauthorized = action.payload.message === 'UNAUTHORIZED';
    device = {
      ...device,
      rtc: {
        ...device.rtc,
        connecting: false,
        peer: null,
        error: action.payload,
        unauthorized: device.rtc.unauthorized || isUnauthorized,
        attempts: device.rtc.attempts + 1,
      },
    };
  } else {
    device = {
      ...device,
      rtc: {
        ...device.rtc,
        connecting: false,
        peer: action.payload,
        error: null,
        unauthorized: false,
        attempts: 0,
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
  invariant(device);
  registered.set(deviceId, {
    ...device,
    rtc: {
      ...device.rtc,
      connecting: false,
      peer: null,
      error: null,
      attempts: 0,
      previewStream: null,
      videoStream: null,
    },
  });
  return {
    ...state,
    registered,
  };
}

function rtcMediaStreamToggle(
  state: DevicesState,
  action: SimpleAction<'DEVICE_RTC_PREVIEW_ENABLE' | 'DEVICE_RTC_PREVIEW_DISABLE' | 'DEVICE_RTC_VIDEO_ENABLE' | 'DEVICE_RTC_VIDEO_DISABLE', string>
): DevicesState {
  const deviceId = action.payload;
  if (!state.registered || !state.registered.has(deviceId)) {
    return state;
  }

  let flag = null;
  let value = null;
  switch (action.type) {
  case 'DEVICE_RTC_PREVIEW_ENABLE':
  case 'DEVICE_RTC_PREVIEW_DISABLE':
    flag = 'previewEnabled';
    value = action.type === 'DEVICE_RTC_PREVIEW_ENABLE';
    break;
  case 'DEVICE_RTC_VIDEO_ENABLE':
  case 'DEVICE_RTC_VIDEO_DISABLE':
    flag = 'videoEnabled';
    value = action.type === 'DEVICE_RTC_VIDEO_ENABLE';
    break;
  default:
    return state;
  }

  const registered = new Map(state.registered);
  const device = state.registered.get(deviceId);
  invariant(device);
  registered.set(deviceId, {
    ...device,
    rtc: {
      ...device.rtc,
      [flag]: value,
    },
  });
  return {
    ...state,
    registered,
  };
}

function rtcMediaStreamAddedRemoved(
  state: DevicesState,
  action: SimpleAction<'DEVICE_RTC_MEDIASTREAMADDED' | 'DEVICE_RTC_MEDIASTREAMREMOVED', RTCMediaStreamResult>
): DevicesState {
  const {deviceId, label, stream} = action.payload;
  if (!state.registered || !state.registered.has(deviceId)) {
    return state;
  }

  let attr = null;
  switch (label) {
  case 'preview':
    attr = 'previewStream';
    break;
  case 'video':
    attr = 'videoStream';
    break;
  default:
    return state;
  }

  const registered = new Map(state.registered);
  const device = state.registered.get(deviceId);
  invariant(device);
  registered.set(deviceId, {
    ...device,
    rtc: {
      ...device.rtc,
      [attr]: action.type === 'DEVICE_RTC_MEDIASTREAMADDED' ? stream : null,
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
  return {
    ...initialState,
  };
}

export const reducer = handleActions({
  DEVICE_REGISTERED_RESTORE,
  DEVICE_REGISTERED_FETCH,
  DEVICE_REGISTERED_UNREGISTER_BEGIN,
  DEVICE_REGISTERED_UNREGISTER_SERVER,
  DEVICE_REGISTERED_UNREGISTER_PEER,
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
  DEVICE_RTC_PREVIEW_ENABLE: rtcMediaStreamToggle,
  DEVICE_RTC_PREVIEW_DISABLE: rtcMediaStreamToggle,
  DEVICE_RTC_VIDEO_ENABLE: rtcMediaStreamToggle,
  DEVICE_RTC_VIDEO_DISABLE: rtcMediaStreamToggle,
  DEVICE_RTC_MEDIASTREAMADDED: rtcMediaStreamAddedRemoved,
  DEVICE_RTC_MEDIASTREAMREMOVED: rtcMediaStreamAddedRemoved,
  AUTH_SIGNOUT,
}, initialState);
