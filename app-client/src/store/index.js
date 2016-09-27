/**
 * @flow
 */

import createStore from 'silk-redux';

import * as builtinReducers from './reducers';

import type {ReducersMapObject} from 'redux';
import type {Store} from 'silk-redux';

export type {
  State,
  ApiState,
  AuthState,
  ConfigState,
  DevicesState,
  NetworkState,
} from './reducers';

export type {Store} from 'silk-redux';

function actionTransformer(action: any): any {
  const {type, requested, error} = action;
  let {payload} = action;
  if (requested) {
    return {type, requested};
  }
  if (error) {
    return {type, error, payload};
  }
  if (typeof payload === 'object' &&
      payload !== null &&
      payload.constructor &&
      payload.constructor.name !== 'Object') {
    payload = `<${payload.constructor.name}>`;
  }
  return {type, payload};
}

function stateTransformer(state: any): any {
  const {clients, devices, messages} = state;

  const transformedClients = Array.from(clients.values());

  const transformedDevices = {
    unconfigured: [],
    registered: [],
    configuring: devices.configuring,
  };

  devices.unconfigured.forEach((session) => {
    const {socketId, deviceId, accountDeviceNumber} = session;
    transformedDevices.unconfigured.push({
      socketId,
      deviceId,
      accountDeviceNumber,
    });
  });

  if (devices.registered) {
    devices.registered.forEach((device) => {
      transformedDevices.registered.push({
        ...device,
        ble: {
          ...device.ble,
          session: device.ble.session ?
            {socketId: device.ble.session.socketId} :
            null,
        },
        rtc: {
          ...device.rtc,
          peer: device.rtc.peer ? '<Peer>' : null,
          error: device.rtc.error ? device.rtc.error.message : null,
        },
      });
    });
  }

  return {
    clients: transformedClients,
    devices: transformedDevices,
    messages,
  };
}

export default function makeStore(
  additionalReducers: ReducersMapObject = {}
): Store<*> {
  const options = {
    logOptions: {
      actionTransformer,
      stateTransformer,
    },
  };

  return createStore({...builtinReducers, ...additionalReducers}, options);
}
