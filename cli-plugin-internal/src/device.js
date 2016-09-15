/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

/* eslint-disable no-console */

import createLog from 'silk-log';
import invariant from 'assert';
import { default as createApi, AccessToken } from 'silk-api';
import {
  createNewState,
  PERSIST_PATH as SILK_CONFIG_FILEPATH,
} from 'silk-device-core/lib/store/persist_reducers';
import {
  encode,
  decode,
} from 'silk-device-core/lib/store/storage';

import type {SilkApi} from 'silk-api';
import type {PersistState} from 'silk-device-core/lib/store/persist_reducers';
import type {Adb} from './adb';
import type Account from './account';

type DeviceOptions = {
  serverUrl?: ?string;
  newAccessToken?: ?boolean;
};

const log = createLog('device');

export default class Device {
  adb: Adb;
  api: SilkApi;
  serverUrl: ?string;
  createNewAccessToken: boolean;

  accessToken: ?AccessToken = null;
  state: ?PersistState = null;

  constructor(options: DeviceOptions, adb: Adb) {
    log.debug(`new device using server: ${String(options.serverUrl)}`);

    this.adb = adb;
    this.serverUrl = options.serverUrl;
    this.createNewAccessToken = options.newAccessToken || false;
    this.api = createApi({
      serverUrl: this.serverUrl,
      metrics: {
        type: 'device',
        tags: {},
      },
    });
  }

  async init(): Promise<void> {
    if (this.createNewAccessToken) {
      this.state = await createNewState();
    } else {
      let encoded;
      try {
        encoded = await this.adb.pull(SILK_CONFIG_FILEPATH);
      } catch (error) {
        log.warn(error);
      }
      invariant(encoded, `Need to create a new access token`);
      const cast: PersistState = decode(encoded);
      this.state = cast;
    }

    const {pub, priv} = this.state.accessToken;
    this.accessToken = this.api.accessToken = new AccessToken(pub, priv);
  }

  async pullDeviceId(): Promise<void> {
    if (!this.state) {
      await this.init();
    }

    const {accessToken} = this;
    invariant(accessToken);
  }

  async setupDevice(account: Account, deviceName: string): Promise<boolean> {
    log.debug(`setupDevice with ${deviceName}`);

    if (!this.state) {
      await this.init();
    }

    const {accessToken} = this;
    invariant(accessToken);

    let { success, regToken, regPublicKey } =
      await account.registerDevice(accessToken.pub, deviceName);

    if (!success) {
      return false;
    }

    let result = await this.api.device.completeRegistration({
      registrarPublicKey: regPublicKey,
      registrationToken: regToken,
    });

    if (!result.success) {
      return false;
    }

    invariant(result.beaconUUID);
    invariant(result.accountDeviceNumber);

    const {state} = this;
    invariant(state);

    state.config = {
      accountBeaconUuid: result.beaconUUID,
      accountDeviceNumber: result.accountDeviceNumber,
      serverUrl: this.serverUrl,
    };
    state.permissions = new Map();
    const permissionsMap = new Map();
    permissionsMap.set('full', {
      type: 'full',
      expires: null,
      actor: null,
    });
    state.permissions.set(regPublicKey, permissionsMap);

    await this.adb.push(SILK_CONFIG_FILEPATH, encode(state));
    return true;
  }

  async removeConfig(): Promise<boolean> {
    try {
      await this.adb.shell(['rm', SILK_CONFIG_FILEPATH]);
      return true;
    } catch (error) {
      log.warn(`Failed to remove '${SILK_CONFIG_FILEPATH}'`, error);
      return false;
    } finally {
      this.accessToken = null;
      this.state = null;
    }
  }
}
