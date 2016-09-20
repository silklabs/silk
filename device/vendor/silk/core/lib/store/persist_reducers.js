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
import upgradeTo1 from './upgradeTo1';

import type {SimpleAction} from 'silk-redux/action';

import type {
  PermissionsAddPayload,
  PermissionsRemovePayload,
  PermissionsClearPayload,
} from './persist_actions';
import type {SerializableObject} from './storage';
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
  version: number;
  accessToken: SerializableAccessToken;
  config: ?ConfigState;
  permissions: PermissionsState;
};

const CURRENT_PERSIST_VERSION = 1;

// Where the persistent data for this device lives.
const PERSIST_DIR = `data/silk/config`;
export const PERSIST_PATH = path.join(PERSIST_DIR, `store.mpk`);

const log = createLog(`redux-persist`);

const initialState: PersistState = {
  version: CURRENT_PERSIST_VERSION,
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

async function maybeUpgrade(
  state: SerializableObject,
): Promise<SerializableObject> {
  invariant(state);

  if (state.version === CURRENT_PERSIST_VERSION) {
    log.debug(`Loaded version '${String(state.version)}', no upgrade needed`);
    return state;
  }

  // Upgrades must return a new object.
  Object.freeze(state);

  log.debug(`Upgrading from version '${String(state.version)}' to version ` +
            `${CURRENT_PERSIST_VERSION}`);

  let upgradedState: SerializableObject;

  switch (CURRENT_PERSIST_VERSION) {
  case 1:
    upgradedState = await upgradeTo1(state);
    break;

  default:
    throw new Error(`No upgrade function to version ` +
                    `${CURRENT_PERSIST_VERSION}`);
  }

  invariant(upgradedState);
  return upgradedState;
}

export async function validate(state: SerializableObject): Promise<void> {
  log.debug(`Attempting to validate`);

  invariant(state);

  invariant(state.version, `No version`);
  invariant(state.version === CURRENT_PERSIST_VERSION,
            `Expected version '${CURRENT_PERSIST_VERSION}' but got ` +
            `'${String(state.version)}' instead`);

  if (state.config) {
    invariant(state.config.accountBeaconUuid, `No accountBeaconUuid`);
    invariant(state.config.accountDeviceNumber, `No accountDeviceNumber`);
  }

  invariant(state.permissions, `No permissions`);

  invariant(state.accessToken, `No accessToken`);
  const {pub, priv} = state.accessToken;
  invariant(pub, `No public key`);
  invariant(priv, `No private key`);

  log.debug(`Validating access token`);
  const accessToken = new AccessToken(pub, priv);
  invariant(await accessToken.genIsValid(), `Access token invalid`);
}

export async function load(persist: 'persist' | 'no-persist'): Promise<void> {
  if (loaded) {
    return;
  }
  loaded = true;

  let state: ?SerializableObject;

  log.debug(`Attempting to load from storage`);

  // We can tolerate failure loading.
  try {
    state = await loadFromStorage(PERSIST_PATH);
  } catch (error) {
    process.nextTick(() => {
      throw error;
    });
  }

  if (typeof state !== `object` || state !== null) {
    const badState = state;
    log.warn(`Loaded bad state`, badState);
    process.nextTick(() => {
      throw new Error(`Loaded bad state: ${JSON.stringify(badState)}`);
    });
    state = null;
  }

  let upgraded: boolean = false;

  if (state) {
    // We can tolerate failure upgrading.
    try {
      const upgradedState = await maybeUpgrade(state);
      if (upgradedState !== state) {
        upgraded = true;
        state = upgradedState;
      }
    } catch (error) {
      process.nextTick(() => {
        throw error;
      });
      state = null;
    }
  }

  if (state) {
    // We can tolerate failure validating.
    try {
      await validate(state);
    } catch (error) {
      process.nextTick(() => {
        throw error;
      });
      state = null;
    }
  }

  // From here on out we must either succeed or throw.
  if (state) {
    if (upgraded && persist === 'persist') {
      log.debug(`Saving upgraded state`);
      await save(state);
    }
  } else {
    log.debug(`Creating initial state`);

    state = await createNewState();
    invariant(state);
    invariant(state.accessToken);
    invariant(state.accessToken.pub !== `invalid`);
    invariant(state.accessToken.priv !== `invalid`);

    if (persist === 'persist') {
      await ensureDirectory(PERSIST_DIR);
      await save(state);
    }
  }

  // Merge into initialState but don't replace it!
  Object.assign(initialState, state);
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
