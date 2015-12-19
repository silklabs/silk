/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import crypto from 'crypto';
import createLog from 'log';
import createApi from 'silk-api';

const log = createLog('account');

const DEFAULT_ROUNDS = 64000;
const SHA256_KEYLENGTH = 32;
const SHA256_HMAC_STRENGTH = 192;

export default class Account {
  constructor(options) {
    log.debug(`new account using server: ${options.serverUrl}`);

    this.serverUrl = options.serverUrl;
    this.api = createApi({serverUrl: this.serverUrl});

    if (options.accessToken) {
      this.api.accessToken = this.accessToken =
        new this.api.id(options.accessToken.pub, options.accessToken.priv);
    } else {
      let entropy = crypto.randomBytes(SHA256_HMAC_STRENGTH);
      this.api.accessToken = this.accessToken = this.api.id.create({entropy});
    }

    if (options.beaconUUID) {
      this.beaconUUID = options.beaconUUID;
    }
  }

  async login(email, password) {
    log.debug(`login using ${email} and ${password}`);

    let passwordHash = crypto.pbkdf2Sync(
      password,
      email,
      DEFAULT_ROUNDS,
      SHA256_KEYLENGTH,
      'sha256'
    ).toString('hex');

    let {
      success,
      beaconUUID,
    } = await this.api.vip.signIn({
      email,
      passwordHash,
      userAgent: 'silkcli'
    });

    this.beaconUUID = beaconUUID;

    if (!success) {
      this.accessToken = undefined;
      this.serverUrl = undefined;
      this.beaconUUID = undefined;
    }
    return success;
  }

  async registerDevice(device, deviceName) {
    log.debug(`registerDevice as '${deviceName}'`);

    let deviceToken = device.accessToken.toString();
    let regToken = this.accessToken.sign(deviceToken);

    await this.api.account.registerDevice({
      devicePublicKey: deviceToken,
      name: deviceName,
      type: 'camera',
      registrationToken: regToken
    });

    return { regToken, regPublicKey: this.accessToken.toString() };
  }
}
