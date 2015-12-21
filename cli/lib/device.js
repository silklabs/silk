/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/* eslint-disable no-console */

import crypto from 'crypto';
import createLog from 'log';
import createApi from 'silk-api';

const log = createLog('device');

const SHA256_HMAC_STRENGTH = 192;

const SILK_ID_FILEPATH = '/data/silk/config/id.json';
const SILK_CONFIG_FILEPATH = '/data/silk/config/config.json';

export default class Device {
  constructor(options, adb) {
    log.debug(`new device using server: ${options.serverUrl}`);

    this.adb = adb;
    this.serverUrl = options.serverUrl;
    this.api = createApi({serverUrl: this.serverUrl});
    let entropy = crypto.randomBytes(SHA256_HMAC_STRENGTH);
    this.api.accessToken = this.accessToken = this.api.id.create({entropy});
  }

  async pullDeviceId() {
    let data = await this.adb.pull(SILK_ID_FILEPATH);
    let token = JSON.parse(data.toString());

    this.api.accessToken = this.accessToken =
      new this.api.id(token.pub, token.priv);
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
        registrationToken: regToken
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
        beaconUUID: this.beaconUUID
      };
      await this.adb.push(SILK_CONFIG_FILEPATH, JSON.stringify(configData));
    }

    return success;
  }

  async updateWifi(ssid, password) {
    log.debug(`update wifi with ${ssid} and ${password}`);

    let stdout = await this.adb.shell(['getprop', 'wifi.interface']);
    let iface = stdout.replace(/\r?\n$/,'');

    let wpaCli = async (args, expectRegex = /(.*)/) => {
      args = ['wpa_cli', `-i${iface}`, `IFNAME=${iface}`].concat(args);

      let stdout = await this.adb.shell(args);
      let match = stdout.match(expectRegex);
      if (!stdout.match(expectRegex)) {
        throw new Error(`Error configuring Wi-Fi: ${stdout}`);
      }
      return match[0];
    };

    let wpaCliExpectOK = async args => await wpaCli(args, /^(OK)/);
    let wpaCliExpectInt = async args => await wpaCli(args, /^(\d+)/);

    if (iface) {
      await wpaCliExpectOK(['remove_network', 'all']);
      await wpaCliExpectOK(['save_config']);
      await wpaCliExpectOK(['disconnect']);
      let id = await wpaCliExpectInt(['add_network']);
      await wpaCliExpectOK(['set_network', id, 'ssid', `"${ssid}"`]);
      await wpaCliExpectOK(['set_network', id, 'psk', `"${password}"`]);
      await wpaCliExpectOK(['enable_network', id]);
      await wpaCliExpectOK(['save_config']);
      await wpaCliExpectOK(['reconnect']);
    } else {
      console.log('No wifi interface, skipping Wi-Fi configuration');
    }

    return true;
  }

  async removeConfig() {
    await this.adb.shell(['rm', SILK_CONFIG_FILEPATH]);
    return true;
  }
}
