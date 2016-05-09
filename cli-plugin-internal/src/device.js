/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/* eslint-disable no-console */

import createLog from 'silk-log';
import invariant from 'assert';
import { default as createApi, AccessToken } from 'silk-api';

const log = createLog('device');

const SILK_ID_FILEPATH = 'data/silk/config/id.json';
const SILK_CONFIG_FILEPATH = 'data/silk/config/config.json';

export default class Device {
  constructor(options, adb) {
    log.debug(`new device using server: ${options.serverUrl}`);

    this.adb = adb;
    this.serverUrl = options.serverUrl;
    this.api = createApi({
      serverUrl: this.serverUrl,
      metrics: {
        type: 'device',
        tags: {},
      },
    });
    this.api.accessToken = this.accessToken = AccessToken.create();
  }

  async pullDeviceId() {
    let data = await this.adb.pull(SILK_ID_FILEPATH);
    let token = JSON.parse(data.toString());

    this.api.accessToken = this.accessToken =
      new AccessToken(token.pub, token.priv);
  }

  async pushDeviceId() {
    await this.adb.push(SILK_ID_FILEPATH, JSON.stringify(this.accessToken));
  }

  async setupDevice(account, deviceName) {
    log.debug(`setupDevice with ${deviceName}`);
    let { success, regToken, regPublicKey } =
        await account.registerDevice(this, deviceName);

    if (success) {
      let result = await this.api.device.completeRegistration({
        registrarPublicKey: regPublicKey,
        registrationToken: regToken,
      });

      success = result.success;
      this.beaconUUID = result.beaconUUID;
      this.registrationToken = regToken;
      this.registrarPublicKey = regPublicKey;
    }

    if (success) {
      let configData = {
        registrarPublicKey: regPublicKey,
        registrationToken: regToken,
        serverUrl: this.serverUrl,
        success: success,
        beaconUUID: this.beaconUUID,
      };
      await this.adb.push(SILK_CONFIG_FILEPATH, JSON.stringify(configData));
    }

    return success;
  }

  async removeConfig() {
    await this.adb.shell(['rm', SILK_CONFIG_FILEPATH]);
    return true;
  }
}
