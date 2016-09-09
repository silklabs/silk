/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

/* eslint-disable no-console */

import invariant from 'assert';
import { default as createApi, AccessToken } from 'silk-api';
import createLog from 'silk-log';
import * as onion from 'silk-onion';

import type {SilkApi} from 'silk-api';
import type {ListDevicesOutputDevices} from 'silk-api/src/gen/account';

type AccountOptions = {
  serverUrl?: ?string;
  accessToken?: ?{pub: string; priv: ?string};
  beaconUUID?: ?string;
};

type RegistrationResult = {
  success: boolean;
  regToken: ?string;
  regPublicKey: string;
};

const log = createLog('account');

export default class Account {
  serverUrl: ?string;
  api: SilkApi;
  accessToken: ?AccessToken;
  beaconUUID: ?string;

  constructor(options: AccountOptions) {
    log.debug(`new account using server: ${String(options.serverUrl)}`);

    this.serverUrl = options.serverUrl;
    this.api = createApi({
      serverUrl: this.serverUrl,
      metrics: {
        type: 'account',
        tags: {},
      },
    });

    if (options.accessToken) {
      this.api.accessToken = this.accessToken =
        new AccessToken(options.accessToken.pub, options.accessToken.priv);
    }

    if (options.beaconUUID) {
      this.beaconUUID = options.beaconUUID;
    }
  }

  async createAccount(email: string, password: string): Promise<boolean> {
    log.debug(`create account using ${email} and ${password}`);

    if (this.accessToken || this.api.accessToken) {
      console.warn('Discarding existing credentials.');
    }

    this.accessToken = this.api.accessToken = await AccessToken.gen();

    let input = {
      userAgent: 'silkcli',
      email: email,
      password: password,
    };

    let {success} = await this.api.vip.createAccountWithPassword(input);

    return success;
  }

  async login(email: string, password: string): Promise<boolean> {
    log.debug(`login using ${email} and ${password}`);

    if (!this.accessToken || !this.api.accessToken) {
      this.accessToken = this.api.accessToken = await AccessToken.gen();
    }

    let {
      success,
      beaconUUID,
    } = await this.api.vip.signInWithPassword({
      email,
      password,
      userAgent: 'silkcli',
    });

    this.beaconUUID = beaconUUID;

    if (!success) {
      this.accessToken = undefined;
      this.beaconUUID = undefined;
    }
    return success;
  }

  async registerDevice(
    deviceId: string,
    deviceName: string
  ): Promise<RegistrationResult> {
    log.debug(`registerDevice as '${deviceName}'`);

    const accessToken = this.accessToken;
    invariant(accessToken);

    const regToken = await accessToken.genSign(deviceId);

    let {success} = await this.api.account.registerDevice({
      devicePublicKey: deviceId,
      name: deviceName,
      type: 'camera',
      registrationToken: regToken,
    });

    return { success, regToken, regPublicKey: accessToken.pub };
  }

  async listDevices(): Promise<Array<ListDevicesOutputDevices>> {
    log.debug(`ListDevices`);
    let {devices} = await this.api.account.listDevices({});
    return devices;
  }

  async unregisterDevice(deviceId: string): Promise<boolean> {
    log.debug(`UnregisterDevice`);

    const {accessToken} = this.api;
    invariant(accessToken);

    const buffer = await onion.genEncode({
      senderIdentity: accessToken,
      recipientIdentity: AccessToken.importPub(deviceId),
      channel: 'http',
      payload: {name: `reset`},
    });

    const {success} = await this.api.account.unregisterDevice({
      devicePublicKey: deviceId,
      factoryResetMessage: buffer.toString('base64'),
    });

    return success;
  }
}
