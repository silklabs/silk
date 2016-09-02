

// UNFORK ME: https://github.com/silklabs/silk-app/blob/master/src/libraries/UserState.js


/**
 * This module contains helpers for maintaining the state of the user.
 *
 * This includes things like:
 *
 *  - current user
 *  - login state
 *  - accessToken
 *  - BLE beacon UUID
 */

import invariant from 'assert';
import { EventEmitter} from 'events';
import {
  AsyncStorage,
  NativeModules,
} from 'react-native';
import { AccessToken } from 'silk-api';
import createLog from 'silk-log';

const log = createLog('UserState');
const { BLESocketManager } = NativeModules;

const ACCESS_TOKEN_KEY = 'user.accessToken';
const REGISTERED_DEVICES_KEY = 'user.registeredDevices';

export class UserState extends EventEmitter {

  /**
   * API Client
   */
  api = null;
  accessToken = null;
  registeredDevices = [];

  constructor(api) {
    super();
    // Initialized api client.
    this.api = api;
  }

  // Load and initialize state...
  static async load(api) {
    let instance = new UserState(api);
    let [ token, registeredDevices] = await Promise.all([
      instance._loadAccessToken(),
      UserState._loadRegisteredDevices(),
    ]);
    log.info('~~ set access token', token);
    api.accessToken = instance.accessToken = token;
    instance.registeredDevices = registeredDevices;
    return instance;
  }

  async _saveAccessToken(accessToken) {
    log.info('Set access token', accessToken);
    let json = JSON.stringify({
      publicKey: accessToken.pub,
      privateKey: accessToken.priv,
    });
    await AsyncStorage.setItem(ACCESS_TOKEN_KEY, json);
    this.emit('authenticated', accessToken);
  }

  /**
   * Get the public/private keys...
   */
  async _loadAccessToken(): Promise<?AccessToken> {
    let accessTokenString = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
    if (!accessTokenString) {
      log.info('No access token set....');
      return null;
    }

    const parsed = JSON.parse(accessTokenString);
    const accessToken = new AccessToken(parsed.publicKey, parsed.privateKey);
    log.info('Using existing access token', accessToken.pub);
    return accessToken;
  }

  static async _loadRegisteredDevices() {
    let registeredDevices = await AsyncStorage.getItem(REGISTERED_DEVICES_KEY);
    if (!registeredDevices) {
      log.info('No registered devices');
      return [ ];
    }

    registeredDevices = JSON.parse(registeredDevices);
    invariant(Array.isArray(registeredDevices));

    log.info('Registered devices', registeredDevices);

    return registeredDevices;
  }

  async signOut() {
    // Clear out any previous state...
    this.api.accessToken = this.accessToken = null;
    this.registeredDevices = [];

    log.debug(`Stop advertising all BLE beacons.`);
    BLESocketManager.removeAllBeaconUuids();

    log.debug(`Remove access token and registered devices from disk storage.`);
    await Promise.all([
      AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
      AsyncStorage.removeItem(REGISTERED_DEVICES_KEY),
    ]);
    this.emit('unauthenticated');
  }

   /**
   * Attempt to sign into the server... Note: this looks pretty similar to sign
   * up right now this will diverge over time.
   */
  async _attemptSignIn(signInType, signInData) {
    log.info('Attempting user sign in:', signInType);
    // Always create a new token when we attempt a sign up...
    const accessToken = await AccessToken.gen();
    this.accessToken = this.api.accessToken = accessToken;

    // XXX: Put some more useful information here...
    let userAgent = 'WebConsole';

    let result;
    switch (signInType) {
    case 'password':
      result = await this.api.vip.signInWithPassword({
        email: signInData.email,
        password: signInData.password,
        userAgent,
      });
      break;
    case 'token':
      result = await this.api.vip.signInWithToken({
        source: signInData.source,
        token: signInData.token,
        userAgent,
      });
      break;
    default:
      throw new Error('Unknown sign in source: ' + signInType);
    }

    if (!result.success) {
      return false;
    }

    log.info('Successfully signed into account');
    if (!result.beaconUUID) {
      throw new Error('Did not get a BLE beacon UUID.');
    }

    log.debug('Adding BLE beacon', result.beaconUUID);
    BLESocketManager.addBeaconUuid(result.beaconUUID);

    await this._saveAccessToken(accessToken);
    return true;
  }

  /*async*/ attemptSignInWithToken(source, token) {
    return this._attemptSignIn('token', {source, token});
  }

  /*async*/ attemptSignInWithPassword(email, password) {
    return this._attemptSignIn('password', {email, password});
  }

  /**
   * Attempt a user signup with the server.
   */
  async attemptSignup(email, password) {
    log.info('Attempting user sign up');
    // Always create a new token when we attempt a sign up...
    const accessToken = await AccessToken.gen();
    this.accessToken = this.api.accessToken = accessToken;

    // XXX: Put some more useful information here...
    let userAgent = 'WebConsole';

    let {
      success,
      beaconUUID,
    } = await this.api.vip.createAccountWithPassword({
      email,
      password,
      userAgent,
    });

    if (!success) {
      return false;
    }

    log.info('Successfully created account');

    log.debug('Adding BLE beacon', beaconUUID);
    BLESocketManager.addBeaconUuid(beaconUUID);

    await this._saveAccessToken(accessToken);
    return true;
  }

  async forgotPassword(email) {
    // XXX: Semi-nasty hacks to ensure we use an access token for password reset.
    this.api.accessToken = await AccessToken.gen();
    let res;
    try {
      res = await this.api.vip.resetPassword({ email });
    } finally {
      this.api.accessToken = null;
    }
    return res;
  }

  /**
   * Sign the deviceId with our accessToken (account) and register it with the
   * server...
   */
  async registerDevice(name, deviceId, type = 'camera') {
    log.info('Registering device', deviceId);

    // Sign the deviceId with the account token...
    // Ugh, we're signing a hex string, which will be hashed as a
    // string before actually being signed.
    const registrationToken = await this.accessToken.genSign(deviceId);

    let {
      success,
      beaconUUID,
    } = await this.api.account.registerDevice({
      devicePublicKey: deviceId,
      name,
      type,
      registrationToken,
    });

    if (success) {
      log.info(`Successfully registered device`);
      BLESocketManager.addBeaconUuid(beaconUUID);
    } else {
      log.warn(`Failed to register device with the server...`);
    }

    return {
      success,
      registrarPublicKey: this.accessToken.pub,
      registrationToken,
    };
  }

  async updateRegisteredDevices(deviceRecords) {
    invariant(this.accessToken, `Must be signed in`);

    let storedRecords = deviceRecords.map((record) => {
      return {
        publicKey: record.publicKey,
      };
    });

    await AsyncStorage.setItem(REGISTERED_DEVICES_KEY,
                               JSON.stringify(storedRecords));

    log.info(`Registered devices updated`, storedRecords);

    this.registeredDevices = storedRecords;
    this.emit(`registered-devices-updated`, storedRecords);
  }
}

export default UserState.load;
