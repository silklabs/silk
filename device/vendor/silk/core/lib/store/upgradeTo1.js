/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import invariant from 'assert';

import type {PermissionMap} from './persist_reducers';
import type {SerializableObject} from './storage';

const THIS_VERSION = 1;

function upgradeFrom0(state) {
  state = {
    ...state,
    version: THIS_VERSION,
  };

  const {permissions} = state;
  invariant(permissions);
  invariant(typeof permissions === `object`);
  invariant(permissions.constructor.name === `Map`);

  // Add the 'revoke' permission to any public keys that had 'rtc' previously.
  const revokePermissionType = `revoke`;
  const rtcPermissionType = `rtc`;

  permissions.forEach((permissionMap: PermissionMap, publicKey: string) => {
    if (permissionMap.has(revokePermissionType)) {
      return;
    }

    const rtcPermission = permissionMap.get(rtcPermissionType);
    if (rtcPermission) {
      permissionMap.set(revokePermissionType, {
        type: revokePermissionType,
        expires: rtcPermission.expires,
        actor: rtcPermission.actor,
      });
    }
  });

  return state;
}

export default async function(
  state: SerializableObject,
): Promise<SerializableObject> {
  invariant(state);

  invariant(state.version === undefined || typeof state.version === `number`);

  const oldVersion = state.version || 0;
  invariant(oldVersion >= 0);
  invariant(oldVersion < THIS_VERSION);

  let upgradedState: SerializableObject;

  switch (oldVersion) {
  case 0:
    upgradedState = upgradeFrom0(state);
    break;

  default:
    throw new Error(`No upgrade function from version ${oldVersion}`);
  }

  invariant(upgradedState);
  invariant(upgradedState.version === THIS_VERSION);
  return upgradedState;
}
