/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import createLog from 'silk-log/device';
import {EventEmitter} from 'events';
import ForwardingEventEmitter from 'silk-utils/forwarding_event_emitter';
import invariant from 'assert';

import getStore from './store';
import actions from './store/actions';

import type {Store} from './store';
import type {
  MutablePermission,
  MutablePermissionType,
} from './store/persist_reducers';

const log = createLog(`permissions`);

export class PermissionManager extends EventEmitter {

  _store: Store;
  _nextExpirationTime: ?number = null;
  _expirationTimer: ?number = null;

  constructor() {
    super();

    const store = getStore();
    invariant(store);

    store.subscribeToPath(`persist.permissions`, this._onPermissionsChanged);
    this._store = store;

    this._expirePermissions();
  }

  _onPermissionsChanged: (() => void) = () => {
    log.debug(`_onPermissionsChanged`);
    this.emit(`change`);
  };

  _expirePermissions: (() => void) = () => {
    log.debug(`_expirePermissions`);

    this._nextExpirationTime = null;

    if (this._expirationTimer) {
      clearTimeout(this._expirationTimer);
      this._expirationTimer = null;
    }

    const now = Date.now();
    const nextExpirationTime = null;

    const {permissions} = this._store.getState().persist;
    permissions.forEach((permissionMap, publicKey) => {
      const expired = [];

      permissionMap.forEach((permission, permissionType) => {
        if (permission.expires) {
          if (permission.expires <= now) {
            expired.push(permissionType);
          } else {
            this._nextExpirationTime =
              nextExpirationTime === null ?
              permission.expires :
              Math.min(nextExpirationTime, permission.expires);
          }
        }
      });

      if (expired.length) {
        process.nextTick(() => {
          this._store.dispatch(actions.persist.removePermissions({
            publicKey,
            permissions: expired,
          }));
        });
      }
    });

    if (nextExpirationTime) {
      log.debug(`Next expiration time`, nextExpirationTime);
      this._expirationTimer =
        setTimeout(Math.max(0, nextExpirationTime - now),
                   this._expirePermissions);
      this._nextExpirationTime = nextExpirationTime;
    }
  };

  add(
    publicKey: string,
    permissions: MutablePermission | Array<MutablePermission>,
  ): void {
    log.debug(`add`, publicKey, permissions);

    if (!Array.isArray(permissions)) {
      permissions = [permissions];
    }

    this._store.dispatch(actions.persist.addPermissions({
      publicKey,
      permissions,
    }));

    const nextExpirationTime = permissions.reduce((time, permission) => {
      if (!permission.expires) {
        return time;
      }
      return time === null ?
             permission.expires :
             Math.min(time, permission.expires);
    }, null);

    if (nextExpirationTime) {
      log.debug(`Next expiration time`, nextExpirationTime);

      if (this._expirationTimer) {
        clearTimeout(this._expirationTimer);
      }
      this._expirationTimer =
        setTimeout(this._expirePermissions,
                   Math.max(0, nextExpirationTime - Date.now()));
    }
  }

  remove(
    publicKey: string,
    permissions: MutablePermissionType | Array<MutablePermissionType>,
  ): void {
    log.debug(`remove`, publicKey, permissions);

    if (!Array.isArray(permissions)) {
      permissions = [permissions];
    }

    this._store.dispatch(actions.persist.removePermissions({
      publicKey,
      permissions,
    }));
  }

  clear(publicKey: string): void {
    log.debug(`clear`, publicKey);

    this._store.dispatch(actions.persist.clearPermissions({publicKey}));
  }

  test(publicKey: string, permissionType: MutablePermissionType): boolean {
    log.debug(`test`, publicKey, permissionType);

    const {permissions} = this._store.getState().persist;
    const permissionMap = permissions.get(publicKey);
    if (!permissionMap) {
      return false;
    }

    if (permissionMap.has('full')) {
      return true;
    }

    const permission = permissionMap.get(permissionType);
    return permission &&
           (!permission.expires || permission.expires > Date.now());
  }

  match(permissionType: MutablePermissionType): Array<string> {
    log.debug(`match`, permissionType);

    const now = Date.now();
    const matches: Array<string> = [];

    const {permissions} = this._store.getState().persist;
    permissions.forEach((permissionMap, publicKey) => {
      if (permissionMap.has('full')) {
        matches.push(publicKey);
      } else {
        const permission = permissionMap.get(permissionType);
        if (permission && (!permission.expires || permission.expires > now)) {
          matches.push(publicKey);
        }
      }
    });

    return matches;
  }

}

let instance: ?PermissionManager = null;

export class PermissionManagerConnection extends ForwardingEventEmitter {

  constructor(instance: PermissionManager) {
    super(instance);
  }

  add(
    publicKey: string,
    permissions: MutablePermission | Array<MutablePermission>,
  ): void {
    invariant(instance);
    return instance.add(publicKey, permissions);
  }

  remove(
    publicKey: string,
    permissions: MutablePermissionType | Array<MutablePermissionType>,
  ): void {
    invariant(instance);
    return instance.remove(publicKey, permissions);
  }

  clear(publicKey: string): void {
    invariant(instance);
    return instance.clear(publicKey);
  }

  test(publicKey: string, permissionType: MutablePermissionType): boolean {
    invariant(instance);
    return instance.test(publicKey, permissionType);
  }

  match(permissionType: MutablePermissionType): Array<string> {
    invariant(instance);
    return instance.match(permissionType);
  }

}

export default function getPermissionManager(): PermissionManagerConnection {
  if (!instance) {
    instance = new PermissionManager();
  }

  return new PermissionManagerConnection(instance);
}
