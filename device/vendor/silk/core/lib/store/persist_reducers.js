/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import {AccessToken} from 'silk-api';
import createLog from 'silk-log/device';
import {handleActions} from 'silk-redux';
import invariant from 'assert';
import path from 'path';

import {
  FULL_PERMISSION,
  IMMUTABLE_PERMISSION_TYPES,
} from '../permissions';
import {
  ensureDirectory,
  load as loadFromStorage,
  save as saveToStorage,
} from './storage';

import type {SimpleAction} from 'silk-redux/action';

import type {
  PermissionsAddPayload,
  PermissionsRemovePayload,
  PermissionsClearPayload,
} from './persist_actions';
import type {
  Permission,
  PermissionType,
} from '../permissions';
import type {ConfigData} from '../config';

type SerializableAccessToken = {
  pub: string;
  priv: string;
};

type ConfigState = {
  accountBeaconUuid: string;
  accountDeviceNumber: number;
  serverUrl: ?string;
};

export type PermissionMap = Map<PermissionType, Permission>;
export type PermissionsState = Map<string, PermissionMap>;

export type PersistState = {
  accessToken: SerializableAccessToken;
  config: ?ConfigState;
  permissions: PermissionsState;
};

// Where the persistent data for this device lives.
const PERSIST_DIR = `data/silk/config`;
export const PERSIST_PATH = path.join(PERSIST_DIR, `store.mpk`);

const log = createLog(`redux-persist`);

const initialState: PersistState = {
  // This will be replaced with a real token in load() before it's ever used.
  accessToken: {
    pub: `invalid`,
    priv: `invalid`,
  },
  config: null,
  permissions: new Map(),
};

let loaded: boolean = false;

function PERSIST_CONFIGURE(
  state: PersistState,
  action: SimpleAction<'PERSIST_CONFIGURE', ConfigData>
): PersistState {
  const {payload} = action;
  invariant(payload);
  invariant(!state.config);
  invariant(state.permissions.size === 0);
  const permissions = new Map();
  const permissionsList = new Map();
  permissionsList.set('full', FULL_PERMISSION);
  permissions.set(payload.registrarPublicKey, permissionsList);
  return {
    ...state,
    config: {
      accountBeaconUuid: payload.beaconUuid,
      accountDeviceNumber: payload.deviceNumber,
      serverUrl: payload.serverUrl,
    },
    permissions,
  };
}

function PERSIST_UNCONFIGURE(
  state: PersistState,
  action: SimpleAction<'PERSIST_UNCONFIGURE', void>
): PersistState {
  if (state.config === null && state.permissions.size === 0) {
    return state;
  }
  return {
    ...state,
    config: null,
    permissions: new Map(),
  };
}

function PERSIST_FORCE_DEFAULT_SERVER_URL(
  state: PersistState,
  action: SimpleAction<'PERSIST_FORCE_DEFAULT_SERVER_URL', void>
): PersistState {
  if (!state.config || !state.config.serverUrl) {
    return state;
  }
  return {
    ...state,
    config: {
      ...state.config,
      serverUrl: null,
    },
  };
}

function PERSIST_PERMISSIONS_ADD(
  state: PersistState,
  action: SimpleAction<'PERSIST_PERMISSIONS_ADD', PermissionsAddPayload>
): PersistState {
  const {payload} = action;
  invariant(payload);
  const {publicKey, permissions: permissionsToAdd} = payload;
  invariant(publicKey);
  invariant(permissionsToAdd);
  invariant(Array.isArray(permissionsToAdd));
  invariant(permissionsToAdd.length);
  invariant(state.config);
  const permissions = new Map(state.permissions);
  const permissionsMap = new Map(permissions.get(publicKey));
  for (let permission of permissionsToAdd) {
    permissionsMap.set(permission.type, permission);
  }
  permissions.set(publicKey, permissionsMap);
  return {
    ...state,
    permissions,
  };
}

function PERSIST_PERMISSIONS_REMOVE(
  state: PersistState,
  action: SimpleAction<'PERSIST_PERMISSIONS_REMOVE', PermissionsRemovePayload>
): PersistState {
  const {payload} = action;
  invariant(payload);
  const {publicKey, permissions: permissionsToRemove} = payload;
  invariant(publicKey);
  invariant(permissionsToRemove);
  invariant(Array.isArray(permissionsToRemove));
  invariant(permissionsToRemove.length);
  invariant(state.config);
  let {permissions} = state;
  const oldPermissionsMap = permissions.get(publicKey);
  if (!oldPermissionsMap) {
    return state;
  }
  invariant(oldPermissionsMap.size);
  const permissionsMap = new Map(oldPermissionsMap);
  for (let permission of permissionsToRemove) {
    permissionsMap.delete(permission);
  }
  if (permissionsMap.size === oldPermissionsMap.size) {
    return state;
  }
  permissions = new Map(permissions);
  if (permissionsMap.size) {
    permissions.set(publicKey, permissionsMap);
  } else {
    permissions.delete(publicKey);
  }
  return {
    ...state,
    permissions,
  };
}

function PERSIST_PERMISSIONS_CLEAR(
  state: PersistState,
  action: SimpleAction<'PERSIST_PERMISSIONS_CLEAR', PermissionsClearPayload>
): PersistState {
  const {payload} = action;
  invariant(payload);
  const {publicKey} = payload;
  invariant(publicKey);
  invariant(state.config);
  let {permissions} = state;
  const oldPermissionsMap = permissions.get(publicKey);
  if (!oldPermissionsMap) {
    return state;
  }
  invariant(oldPermissionsMap.size);
  const permissionsMap = new Map(oldPermissionsMap);
  oldPermissionsMap.forEach((permission, type) => {
    if (!IMMUTABLE_PERMISSION_TYPES.has(type)) {
      permissionsMap.delete(type);
    }
  });
  if (permissionsMap.size === oldPermissionsMap.size) {
    return state;
  }
  permissions = new Map(permissions);
  if (permissionsMap.size) {
    permissions.set(publicKey, permissionsMap);
  } else {
    permissions.delete(publicKey);
  }
  return {
    ...state,
    permissions,
  };
}

export const reducer = handleActions({
  PERSIST_CONFIGURE,
  PERSIST_UNCONFIGURE,
  PERSIST_FORCE_DEFAULT_SERVER_URL,
  PERSIST_PERMISSIONS_ADD,
  PERSIST_PERMISSIONS_REMOVE,
  PERSIST_PERMISSIONS_CLEAR,
}, initialState);

async function init(): Promise<PersistState> {
  await ensureDirectory(PERSIST_DIR);

  const state = await createNewState();
  invariant(state);
  invariant(state.accessToken);
  invariant(state.accessToken.pub !== `invalid`);
  invariant(state.accessToken.priv !== `invalid`);

  await save(state);

  return state;
}

async function validate(state: PersistState): Promise<void> {
  invariant(state);

  const {pub, priv} = state.accessToken;
  invariant(pub);
  invariant(priv);

  log.debug(`Validating access token`);
  const accessToken = new AccessToken(pub, priv);
  invariant(await accessToken.genIsValid());

  // Something else here?
}

export async function load(): Promise<void> {
  if (loaded) {
    return;
  }
  loaded = true;

  let loadedState: ?PersistState = null;

  // We can tolerate failure loading.
  try {
    loadedState = await loadFromStorage(PERSIST_PATH);
  } catch (error) {
    process.nextTick(() => {
      throw error;
    });
  }

  if (loadedState) {
    // We can tolerate failure validating.
    try {
      await validate(loadedState);
    } catch (error) {
      process.nextTick(() => {
        throw error;
      });
      loadedState = null;
    }
  }

  if (!loadedState) {
    // This must succeed.
    loadedState = await init();
    invariant(loadedState);
  }

  // Merge into initialState but don't replace it!
  Object.assign(initialState, loadedState);
}

export function save(state: PersistState): Promise<void> {
  return saveToStorage(state, PERSIST_PATH);
}

export async function createNewState(): Promise<PersistState> {
  log.debug(`Creating new access token`);
  const accessToken = await AccessToken.gen();
  invariant(accessToken.priv);

  return {
    ...initialState,
    accessToken: {
      pub: accessToken.pub,
      priv: accessToken.priv,
    },
  };
}
