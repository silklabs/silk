/**
 * TODO: this is a temporary remainder of the pre-redux world and will
 * be removed soon.
 */

import invariant from 'assert';
import {EventEmitter} from 'events';
import {AsyncStorage, NativeModules} from 'react-native';
import createLog from 'silk-log';

const log = createLog('UserState');
const {BLESocketManager} = NativeModules;

const REGISTERED_DEVICES_KEY = 'user.registeredDevices';

export class UserState extends EventEmitter {

  /**
   * API Client
   */
  api = null;
  registeredDevices = [];

  constructor(api) {
    super();
    // Initialized api client.
    this.api = api;
  }

  get accessToken() {
    return this.api.accessToken;
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
