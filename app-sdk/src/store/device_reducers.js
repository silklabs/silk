/**
 * @flow
 */

import invariant from 'assert';
import {handleActions} from 'redux-actions';

import type {ListDevicesOutput} from 'silk-api/src/gen/account';
import type {Peer} from 'silk-rtc';

import type {Action} from './action';
import type {DeviceSession} from '../ble/device_manager';

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

type UnregisteredDevice = {
  bleDeviceSession: DeviceSession;
};

export type DevicesState = {
  /**
   * Map deviceId to RegisteredDevice records. null indicates we
   * haven't been able to determine this list yet.
   */
  registered: ?Map<string, RegisteredDevice>;

  /**
   * Map locally (to this client) and temporarily (for the runtime of
   * the app) unique identifier to an UnregisteredDevice record.
   */
  unregistered: Map<number, UnregisteredDevice>;
};

const initialState: DevicesState = {
  registered: null,
  unregistered: new Map(),
};

function DEVICE_LIST_RESTORE(
  state: DevicesState,
  action: Action<'DEVICE_LIST_RESTORE', ?ListDevicesOutput>
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

function DEVICE_LIST_FETCH(
  state: DevicesState,
  action: Action<'DEVICE_LIST_FETCH', ListDevicesOutput>
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

export const reducer = handleActions({
  DEVICE_LIST_RESTORE,
  DEVICE_LIST_FETCH,
}, initialState);
