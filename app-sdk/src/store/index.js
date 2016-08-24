/**
 * @flow
 */

import {applyMiddleware, createStore, combineReducers} from 'redux';
import thunk from 'redux-thunk';
import watch from 'redux-watch';
import createLog from 'silk-log';

import * as builtinReducers from './reducers';

export type {
  State,
  ApiState,
  AuthState,
  ConfigState,
  DevicesState,
  NetworkState,
} from './reducers';

type PathSubscriber<T> = (newValue: T, oldValue: T, objectPath: string) => any;

export type Store<S> = {
  getState: () => S;
  dispatch: (action: any) => any;
  subscribe: (listener: (() => any)) => (() => void);
  subscribeToPath: (path: string, listener: PathSubscriber<*>) => (() => void);
};

type ReducerMap = {
  // Wish we could type that better.
  [name: string]: (state: any, action: any) => any;
};

const log = createLog('app-sdk-store');

const LOG_STATE_TRANSITIONS = false;

// If |LOG_STATE_TRANSITIONS| is true then this function will be called before
// logging state transitions. Use it to select only the data you care about.
function logStateTransformer(state) {
  const {devices, messages} = state;

  const transformedDevices = {
    unconfigured: [],
    registered: [],
  };

  devices.unconfigured.forEach((session, id) => {
    transformedDevices.unconfigured.push([id, session.socketId]);
  });

  if (devices.registered) {
    devices.registered.forEach((device, deviceId) => {
      const newDevice = {
        ...device,
        ble: {
          ...device.ble,
          session: device.ble.session ? device.ble.session.socketId : null,
        },
        rtc: {
          ...device.rtc,
          peer: device.rtc.peer ? '<Peer>' : null,
          error: device.rtc.error ? device.rtc.error.message : null,
        },
      };
      transformedDevices.registered.push([deviceId, newDevice]);
    });
  }

  return {
    devices: transformedDevices,
    messages,
  };
}

const logger = store => next => action => {
  if (LOG_STATE_TRANSITIONS) {
    log.debug(`Old state`, logStateTransformer(store.getState()));
  }

  if (action.requested) {
    log.debug(`${action.type} requested`);
  } else if (action.error) {
    log.error(`${action.type} error:`, action.payload);
  } else {
    let {payload} = action;
    // Stupid heuristic to get the most informative but least spammy
    // log messages from actions.
    if (typeof payload === 'object' && payload !== null &&
        (!payload.constructor || payload.constructor.name !== 'Object')) {
      payload = `<${payload.constructor.name}>`;
    }
    log.debug(`${action.type} payload:`, payload);
  }

  const returnedValue = next(action);

  if (LOG_STATE_TRANSITIONS) {
    log.debug(`New state`, logStateTransformer(store.getState()));
  }

  return returnedValue;
};

export default function makeStore(
  additionalReducers: ReducerMap = {}
): Store<*> {
  const reducer = combineReducers({...builtinReducers, ...additionalReducers});
  const store = createStore(reducer, applyMiddleware(thunk, logger));

  return {
    ...store,
    subscribeToPath: (path, listener) => {
      const wrappedListener = watch(store.getState, path)(listener);
      return store.subscribe(wrappedListener);
    },
  };
}
