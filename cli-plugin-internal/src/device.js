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

import type {SilkApi} from 'silk-api';
import type {Adb} from './adb';
import type Account from './account';

type DeviceOptions = {
  serverUrl?: ?string;
};

const log = createLog('device');

const SILK_ID_FILEPATH = 'data/silk/config/id.json';
const SILK_CONFIG_FILEPATH = 'data/silk/config/config.json';

export default class Device {
  adb: Adb;
  api: SilkApi;
  serverUrl: ?string;
  accessToken: AccessToken;

  constructor(options: DeviceOptions, adb: Adb) {
    log.debug(`new device using server: ${String(options.serverUrl)}`);

    this.adb = adb;
    this.serverUrl = options.serverUrl;
    this.api = createApi({
      serverUrl: this.serverUrl,
      metrics: {
        type: 'device',
        tags: {},
      },
    });
  }

  async pullDeviceId(): Promise<void> {
    const id = await this.adb.pull(SILK_ID_FILEPATH);
    this.accessToken = this.api.accessToken = AccessToken.import(id);
  }

  async pushNewDeviceId(): Promise<void> {
    this.accessToken = this.api.accessToken = await AccessToken.gen();
    await this.adb.push(SILK_ID_FILEPATH, this.accessToken.export());
  }

  async setupDevice(account: Account, deviceName: string): Promise<boolean> {
    log.debug(`setupDevice with ${deviceName}`);

    invariant(
      this.accessToken && this.api.accessToken,
      'Need to pull existing device ID or push new one before setting up device'
    );

    let { success, regToken, regPublicKey } =
      await account.registerDevice(this.accessToken.pub, deviceName);

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

    const configData = {
      registrarPublicKey: regPublicKey,
      registrationToken: regToken,
      serverUrl: this.serverUrl,
      success: success,
      beaconUUID: result.beaconUUID,
    };
    await this.adb.push(SILK_CONFIG_FILEPATH, JSON.stringify(configData));

    return true;
  }

  async removeConfig(): Promise<boolean> {
    await this.adb.shell(['rm', SILK_CONFIG_FILEPATH]);
    return true;
  }
}
