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

// The API violates this rule, so disable it for the whole file.
/* eslint new-cap:0 */

import assert from 'assert';
import { EventEmitter} from 'events';
import createLog from 'log';

import {
  AsyncStorage,
  NativeModules,
} from 'react-native';
import {
  getRandomBytes,
  PBKDF2KeyDerivation,
} from './Crypto';

const log = createLog('UserState');
const { BLESocketManager } = NativeModules;

const ACCESS_TOKEN_KEY = 'user.accessToken';
const REGISTERED_DEVICES_KEY = 'user.registeredDevices';

/**
 * This value has been chosen based on what elliptic would do when generating
 * it's own entropy.
 *
 * See: https://github.com/indutny/elliptic/blob/cbccbc862bcbb3a0f2ce8021d340e51f785e2ebd/lib/elliptic/ec/index.js#L60
 * See: https://github.com/indutny/hash.js/blob/b8d200196b7e8a335d1f94c6b14366491822b7bb/lib/hash/sha.js#L105
 *
 * The ed25519 algorithm uses sha256 under the hood.
 */
const SHA256_HMAC_STRENGTH = 192;

export class UserState extends EventEmitter {

  /**
   * API Client
   */
  api = null;
  accessToken = null;
  registeredDevices = [ ];

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

  async _createAccessToken() {
    // See above comment for SHA256_HMAC_STRENGTH to understand what this is
    // doing.
    let entropy = await getRandomBytes(SHA256_HMAC_STRENGTH);
    let accessToken = this.api.id.create({ entropy });
    return accessToken;
  }

  /**
   * Get the public/private keys...
   */
  async _loadAccessToken() {
    let accessToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
    if (!accessToken) {
      log.info('No access token set....');
      return accessToken;
    }

    let parsed = JSON.parse(accessToken);
    accessToken = new this.api.id(parsed.publicKey, parsed.privateKey);
    log.info('Using existing access token', accessToken);
    return accessToken;
  }

  static async _loadRegisteredDevices() {
    let registeredDevices = await AsyncStorage.getItem(REGISTERED_DEVICES_KEY);
    if (!registeredDevices) {
      log.info('No registered devices');
      return [ ];
    }

    registeredDevices = JSON.parse(registeredDevices);
    assert(Array.isArray(registeredDevices));

    log.info('Registered devices', registeredDevices);

    return registeredDevices;
  }

  async signOut() {
    // Clear out any previous state...
    this.api.accessToken = this.accessToken = null;

    log.debug(`Stop advertising all BLE beacons.`);
    BLESocketManager.removeAllBeaconUuids();

    log.debug(`Remove access token and registered devices from disk storage.`);
    await Promise.all([
      AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
      AsyncStorage.removeItem(REGISTERED_DEVICES_KEY),
    ]);
    this.emit('unauthenticated');
  }

  async checkPassword(email, password) {
    let passwordHash = await PBKDF2KeyDerivation(
      password, /* input */
      email /* salt */
    );

    return await this.api.vip.checkPassword({
      email,
      passwordHash,
    });
  }

   /**
   * Attempt to sign into the server... Note: this looks pretty similar to sign
   * up right now this will diverge over time.
   */
  async attemptSignIn(email, password) {
    log.info('Attempting user sign in');
    // Always create a new token when we attempt a sign up...
    let accessToken = await this._createAccessToken();
    this.accessToken = this.api.accessToken = accessToken;

    let passwordHash = await PBKDF2KeyDerivation(
      password, /* input */
      email /* salt */
    );

    // XXX: Put some more useful information here...
    let userAgent = 'iOS';

    let {
      success,
      beaconUUID,
    } = await this.api.vip.signIn({
      email,
      passwordHash,
      userAgent,
    });

    if (!success) {
      return false;
    }

    log.info('Successfully signed into account', email);
    if (!beaconUUID) {
      throw new Error('Did not get a BLE beacon UUID.');
    }

    log.debug('Adding BLE beacon', beaconUUID);
    BLESocketManager.addBeaconUuid(beaconUUID);

    await this._saveAccessToken(accessToken);
    return true;
  }

  /**
   * Attempt a user signup with the server.
   */
  async attemptSignup(email, password) {
    log.info('Attempting user sign up');
    // Always create a new token when we attempt a sign up...
    let accessToken = await this._createAccessToken();
    this.accessToken = this.api.accessToken = accessToken;

    let passwordHash = await PBKDF2KeyDerivation(
      password, /* input */
      email /* salt */
    );

    // XXX: Put some more useful information here...
    let userAgent = 'iOS';

    let {
      success,
      beaconUUID,
    } = await this.api.vip.createAccount({
      email,
      passwordHash,
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

  /**
   * Sign the deviceId with our accessToken (account) and register it with the
   * server...
   */
  async registerDevice(name, deviceId, type = 'camera') {
    deviceId = this.api.id.importPub(deviceId);
    log.info('Registering device', deviceId);

    // Sign the deviceId with the account token...
    let registrationToken = this.accessToken.sign(deviceId.toString());

    let {
      success,
      beaconUUID,
    } = await this.api.account.registerDevice({
      devicePublicKey: deviceId.toString(),
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
      registrarPublicKey: this.accessToken.toString(),
      registrationToken,
    };
  }

  async updateRegisteredDevices(deviceRecords) {
    assert(this.accessToken, `Must be signed in`);

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
