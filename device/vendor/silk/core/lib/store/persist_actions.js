/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import {actionFromPayload} from 'silk-redux/action';

import type {
  MutablePermission,
  MutablePermissionType,
} from './persist_reducers';

export type PermissionsClearPayload = {
  publicKey: string;
};

export type PermissionsAddPayload = PermissionsClearPayload & {
  permissions: Array<MutablePermission>;
};

export type PermissionsRemovePayload = PermissionsClearPayload & {
  permissions: Array<MutablePermissionType>;
};

export const configure = actionFromPayload('PERSIST_CONFIGURE');
export const unconfigure = actionFromPayload('PERSIST_UNCONFIGURE');
export const forceDefaultServerUrl =
  actionFromPayload('PERSIST_FORCE_DEFAULT_SERVER_URL');
export const addPermissions = actionFromPayload('PERSIST_PERMISSIONS_ADD');
export const removePermissions = actionFromPayload('PERSIST_PERMISSIONS_REMOVE');
export const clearPermissions = actionFromPayload('PERSIST_PERMISSIONS_CLEAR');
