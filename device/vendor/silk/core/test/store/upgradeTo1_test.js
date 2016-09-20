/**
 * @flow
 */

import assert from 'assert';
import {AccessToken} from 'silk-api';

import {validate} from '../../lib/store/persist_reducers';
import upgrade from '../../lib/store/upgradeTo1';

import type {PersistState} from '../../lib/store/persist_reducers';

const invariant = assert;

const previousVersion = {
  accessToken: {
    pub: `invalid`,
    priv: `invalid`,
  },
  config: null,
  permissions: new Map(),
};

function makePermissionInitializer(type) {
  return [type, {
    type,
    expires: null,
    actor: null,
  }];
}

suite('upgradeTo1', () => {

  suiteSetup(async () => {
    const {pub, priv} = await AccessToken.gen();
    invariant(pub);
    invariant(priv);
    previousVersion.accessToken.pub = pub;
    previousVersion.accessToken.priv = priv;
  });

  test('previousVersion does not validate', async () => {
    let error: Error;
    try {
      await validate(previousVersion);
    } catch (err) {
      error = err;
    }

    assert(error);
  });

  test('basics', async () => {
    const upgraded: PersistState = await upgrade(previousVersion);
    assert(upgraded !== previousVersion);
    assert.equal(upgraded.version, 1);
    await validate(upgraded);
  });

  test('no rtc permissions', async () => {
    const {pub} = await AccessToken.gen();

    const permissionMap = new Map([
      makePermissionInitializer('ble-temp'),
    ]);

    const permissions = new Map(previousVersion.permissions);
    permissions.set(pub, permissionMap);

    const old = {
      ...previousVersion,
      permissions,
    };

    const upgraded: PersistState = await upgrade(old);
    assert(upgraded !== old);
    await validate(upgraded);
    assert.equal(upgraded.version, 1);

    const newPermissionMap = upgraded.permissions.get(pub);
    invariant(newPermissionMap);

    assert.equal(newPermissionMap.has('ble-temp'), true);
    assert.equal(newPermissionMap.has('revoke'), false);
  });

  test('rtc permissions', async () => {
    const {pub} = await AccessToken.gen();

    const permissionMap = new Map([
      makePermissionInitializer('ble'),
      makePermissionInitializer('rtc'),
      makePermissionInitializer('reset'),
    ]);

    const permissions = new Map(previousVersion.permissions);
    permissions.set(pub, permissionMap);

    const old = {
      ...previousVersion,
      permissions,
    };

    const upgraded: PersistState = await upgrade(old);
    assert(upgraded !== old);
    await validate(upgraded);
    assert.equal(upgraded.version, 1);

    const newPermissionMap = upgraded.permissions.get(pub);
    invariant(newPermissionMap);

    assert.equal(newPermissionMap.has('ble'), true);
    assert.equal(newPermissionMap.has('rtc'), true);
    assert.equal(newPermissionMap.has('reset'), true);
    assert.equal(newPermissionMap.has('revoke'), true);
  });

  test('negative version', async () => {
    const old = {
      ...previousVersion,
      version: -1,
    };

    let error: Error;
    try {
      await upgrade(old);
    } catch (err) {
      error = err;
    }

    assert(error);
  });

  test('higher version', async () => {
    const old = {
      ...previousVersion,
      version: 10,
    };

    let error: Error;
    try {
      await upgrade(old);
    } catch (err) {
      error = err;
    }

    assert(error);
  });

  test('same version', async () => {
    const old = {
      ...previousVersion,
      version: 1,
    };

    let error: Error;
    try {
      await upgrade(old);
    } catch (err) {
      error = err;
    }

    assert(error);
  });

});
