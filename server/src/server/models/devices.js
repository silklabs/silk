/* @flow */
/**
 * We represent each device as a single record in the data store...
 *
 * Note that the devices list here may or may not be unique physical devices we
 * reset the identity entirely between device factory resets.
 */
import * as Joi from 'joi';
import Base from './base';
import { ObjectID } from 'mongodb';
import AccessToken from 'silk-api/src/access_token';

import type {UnregisterInput} from 'silk-api/src/gen/device';

const PUBLIC_KEY = Joi.string().hex().required();
const TYPE_SCHEMA = Joi.string().regex(/^[a-z\d_-]+$/).max(80).required();
// XXX: Max name length was chosen randomly...
const NAME_SCHEMA = Joi.string().min(1).max(60).required();
const MAX_ACCOUNT_DEVICE_NUMBER = 65535;

const ACCOUNT_DEVICE_NUMBER_SCHEMA =
  Joi.number().integer().min(1).max(MAX_ACCOUNT_DEVICE_NUMBER);

const BASE64_REGEX =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ONION_SCHEMA =
  Joi.string().regex(BASE64_REGEX, 'base64');

export type Record = {
  _id: ObjectID;
  accountId: string;
  name: string;
  type: string;
  registered: boolean;
  factoryResetMessage?: string;
  accessToken: {
    publicKey: string;
  };
  registration: {
    accountId: string;
    accountDeviceNumber?: number;
  }
  // TODO: finish type...
};

export default class Devices extends Base {

  static NAME_SCHEMA = NAME_SCHEMA;
  static TYPE_SCHEMA = TYPE_SCHEMA;
  static ACCOUNT_DEVICE_NUMBER_SCHEMA = ACCOUNT_DEVICE_NUMBER_SCHEMA;
  static ONION_SCHEMA = ONION_SCHEMA;

  static COLLECTION = 'devices';

  static ERROR = {
    duplicatePublicKey: 'DuplicatePublicKey',
    unknownDevice: 'UnknownDevice',
    invalidRegistrationToken: 'InvalidRegistrationToken',
  };

  static INDEX = [
    {
      props: {
        'accessToken.publicKey': 1,
      },
      options: { unique: true },
    },
    {
      props: {
        'accountId': 1,
      },
    },
    {
      props: {
        'registration.accountId': 1,
        'registration.accountDeviceNumber': -1,
      },
      options: {
        unique: true,
        sparse: true,
      },
    },
  ];

  static SCHEMA = {
    findByPublicKey: Joi.object().keys({
      publicKey: PUBLIC_KEY,
    }),

    register: Joi.object().keys({
      accountId: Joi.string().required(),
      publicKey: PUBLIC_KEY,
      type: TYPE_SCHEMA,
      name: NAME_SCHEMA,
      registrationToken: Joi.string().required(),
    }),

    unregister: Joi.object().keys({
      publicKey: PUBLIC_KEY,
      factoryResetMessage: ONION_SCHEMA.required(),
    }),

    validateRegistration: Joi.object({
      publicKey: PUBLIC_KEY,
      registrationToken: Joi.string().required(),
    }),

    // When the record is persisted to disk...
    record: Joi.object().keys({
      // The account which this device belongs to.
      accountId: Joi.object().type(ObjectID).required(),

      // Is this device currently registered.
      registered: Joi.boolean().required(),

      // When this device was registered.
      createdAt: Joi.date().required(),

      accessToken: Joi.object({
        // Public key for this device.
        publicKey: PUBLIC_KEY,
      }).required(),

      // What kind of device this is... Eventually we will need some more
      // details here...
      type: TYPE_SCHEMA,

      // Name of this device.
      name: NAME_SCHEMA,

      // A factory reset message if the device was unregistered.
      factoryResetMessage: ONION_SCHEMA.optional(),

      registration: Joi.object().keys({
        // We store a duplicate of accountId for the purposes of indexing certain
        // other fields only when the device is fully registered.
        accountId: Joi.object().type(ObjectID),

        // When the device is broadcasting an ibeacon we need   an id which is not
        // the same as the public key and can also fit in 2 bytes.
        accountDeviceNumber: ACCOUNT_DEVICE_NUMBER_SCHEMA,

        // If the registration of this device has been completed
        complete: Joi.boolean().required(),

        // The registration token for this device (usually the publicKey of this
        // device signed by the private key of an accountToken).
        token: Joi.string().required(),
      }).required(),

      /**
       * TODO: Device registration details are very important details that we
       * should monitor closely... We likely will want to record more details.
       */
    }),
  };

  genIsRegistrationTokenValid(
    registrarPublicKey: string,
    devicePublicKey: string,
    token: string
  ): Promise<bool> {
    let accountAccessToken = AccessToken.importPub(registrarPublicKey);
    return accountAccessToken.genVerify(devicePublicKey, token);
  }

  /**
   * Create and register the device in the database.
   *
   * @param {String} registrarPublicKey to validate registration token.
   * @param {Object} payload
   */
  async register(registrarPublicKey: string, payload: any): any {
    payload = this.validate(payload, 'register');

    const tokenValid = await this.genIsRegistrationTokenValid(
      registrarPublicKey,
      payload.publicKey,
      payload.registrationToken
    );

    if (!tokenValid) {
      return this.error('invalidRegistrationToken');
    }

    const accountId = new ObjectID(payload.accountId);
    let record = this.validate({
      accountId,
      createdAt: new Date(),
      type: payload.type,
      name: payload.name,
      registered: true,
      accessToken: {
        publicKey: payload.publicKey,
      },
      registration: {
        // accountId is set here only when register is complete.
        complete: false,
        token: payload.registrationToken,
      },
    }, 'record');

    // Insert the document but do not override any other accounts with the same
    // public key!
    let { result: insert } = await this.collection.update(
      { 'accessToken.publicKey': record.accessToken.publicKey }, // query
      { $setOnInsert: record }, // insert only if no duplicates...
      { upsert: true }
    );

    if (insert.n === 1) {
      let device = await this.findByPublicKey({
        publicKey: record.accessToken.publicKey,
      });
      return { id: device._id };
    }

    return this.error('duplicatePublicKey');
  }

  async unregister(payload: UnregisterInput): mixed {
    payload = this.validate(payload, 'unregister');

    const factoryResetMessage = payload.factoryResetMessage;

    let { result } = await this.collection.update(
      { 'accessToken.publicKey': payload.publicKey },
      {
        $set: {
          registered: false,
          factoryResetMessage,
        },
        $unset: {
          // Remove from the index... This will allow us in the future to re-use
          // device id's if we ever need to.
          'registration.accountDeviceNumber': '',
          // This field should only be present when we are registered.
          'registration.accountId': '',
        },
      }
    );

    if (result.n !== 1) {
      return this.error('unknownDevice');
    }

    if (!result.ok) {
      throw new Error(`Unregister operation has failed`, result);
    }

    return {};
  }

  /**
   * Validate the registration of the device.
   *
   * NOTE: This is idempotent.
   *
   * @param {String} registrarPublicKey to validate registration token.
   * @param {Object} payload for validate.
   */
  async validateRegistration(registrarPublicKey: string, payload: any): any {
    payload = this.validate(payload, 'validateRegistration');

    let device = await this.findByPublicKey({
      publicKey: payload.publicKey,
    });

    if (!device) {
      return this.error('unknownDevice');
    }

    const tokenValid = await this.genIsRegistrationTokenValid(
      registrarPublicKey,
      payload.publicKey,
      payload.registrationToken
    );

    if (!tokenValid) {
      return this.error('invalidRegistrationToken');
    }

    // Calculate and assign a account unique number to this device.
    // XXX: NOTE that we accept the possible race condition of failing to update
    // the device as complete due to concurrent registration of devices. This is
    // unlikely and should be handled by the client retries as this would result
    // in a 500 error...
    const highestDeviceNumber = await this.collection
      .find({
        accountId: device.accountId,
        'registration.accountDeviceNumber': {
          $exists: true,
        },
      })
      .limit(1)
      .sort({ 'registration.accountDeviceNumber': -1 })
      .toArray();

    const accountDeviceNumber = highestDeviceNumber[0] ?
      highestDeviceNumber[0].registration.accountDeviceNumber + 1 : 1;

    if (accountDeviceNumber > MAX_ACCOUNT_DEVICE_NUMBER) {
      // TODO: Ideally we recycle ids when they become unused. That is relatively
      // easy but highly unlikely given the number of devices we allow.
      throw new Error(`Account has exceeded maximum number of beacon id's`);
    }

    let { result: update } = await this.collection.update(
      { _id: device._id },
      {
        $set: {
          'registration.complete': true,
          'registration.accountDeviceNumber': accountDeviceNumber,
          'registration.accountId': device.accountId,
        },
      }
    );

    if (!update.ok) {
      throw new Error(`
        Error in mongodb update:

          ${JSON.stringify(update)}
      `);
    }

    return { success: true, accountDeviceNumber };
  }

  /**
   * Find the device by it's public key (for auth)
   */
  async findByPublicKey(payload: any): any {
    payload = this.validate(payload, 'findByPublicKey');
    let { publicKey } = payload;

    return await this.collection.findOne({
      'accessToken.publicKey': publicKey,
    });
  }

  async findAllByAccount(accountId: any): any {
    if (!(accountId instanceof ObjectID)) {
      accountId = new ObjectID(accountId);
    }

    return await this.collection.find({
      // Only return devices which are actively registered with the server...
      'registered': true,
      'accountId': accountId,
    }).toArray();
  }

  /**
   * Verify that the public keys given for devices belong to the account given.
   */
  async belongsToAccount(
    accountId: string,
     ...publicKeys: Array<string>
   ): Promise<bool> {
    // Attempt to find all the public keys filtering on the account id.
    let query = {
      accountId,
      'accessToken.publicKey': {
        $exists: true,
        $in: publicKeys,
      },
    };

    // Run the query and stick the results in a set so we can verify all
    // the devices belong to the given account.
    let listedPublicKeys = (await this.collection.find(
      query,
      { 'accessToken.publicKey': 1 } // only return accessToken.publicKey
    ).toArray()).reduce((result, value) => {
      result.add(value.accessToken.publicKey);
      return result;
    }, new Set());

    // Only return true if _every_ single id is inside the given account.
    return publicKeys.every((publicKey) => {
      return listedPublicKeys.has(publicKey);
    });
  }

}
