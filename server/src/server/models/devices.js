/* @flow */
/**
 * We represent each device as a single record in the data store...
 *
 * Note that the devices list here may or may not be unique physical devices we
 * reset the identity entirely between device factory resets.
 */

import invariant from 'assert';
import * as Joi from 'joi';
import { ObjectID } from 'mongodb';
import AccessToken from 'silk-api/src/access_token';
import createLog from 'silk-log';

import {
  default as Base,
  PUBLIC_KEY_SCHEMA,
} from './base';

import type {ErrorState} from './base';
import type {UnregisterInput} from 'silk-api/src/gen/device';

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
    complete: boolean;
    accountId: string;
    token: string;
    accountDeviceNumber?: number;
  };
  mailbox?: Array<string>;
};

type RegisterOutput = {
  id: string;
};

type UnregisterOutput = {
};

type ValidateRegistrationInput = {
  publicKey: string;
  registrationToken: string;
};

type ValidateRegistrationOutput = {
  accountDeviceNumber: number;
};

type AddToMailboxInput = {
  publicKey: string;
  message: string;
};

type AddToMailboxOutput = {};

type AcknowledgeMessageOutput = {};

const log = createLog('models:devices');

const TYPE_SCHEMA = Joi.string().regex(/^[a-z\d_-]+$/).max(80).required();
// XXX: Max name length was chosen randomly...
const NAME_SCHEMA = Joi.string().min(1).max(60).required();
const MAX_ACCOUNT_DEVICE_NUMBER = 65535;

const ACCOUNT_DEVICE_NUMBER_SCHEMA =
  Joi.number().integer().min(1).max(MAX_ACCOUNT_DEVICE_NUMBER);

const BASE64_REGEX =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ONION_SCHEMA =
  Joi.string().regex(BASE64_REGEX, 'onion');

const REGISTRATION_TOKEN_SCHEMA = Joi.string().hex().required();

export default class Devices extends Base {

  static NAME_SCHEMA = NAME_SCHEMA;
  static TYPE_SCHEMA = TYPE_SCHEMA;
  static ACCOUNT_DEVICE_NUMBER_SCHEMA = ACCOUNT_DEVICE_NUMBER_SCHEMA;
  static ONION_SCHEMA = ONION_SCHEMA;
  static PUBLIC_KEY_SCHEMA = PUBLIC_KEY_SCHEMA;

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
    findByPublicKey: PUBLIC_KEY_SCHEMA,

    register: Joi.object().keys({
      accountId: Joi.string().required(),
      publicKey: PUBLIC_KEY_SCHEMA,
      type: TYPE_SCHEMA,
      name: NAME_SCHEMA,
      registrationToken: REGISTRATION_TOKEN_SCHEMA,
    }).required(),

    unregister: Joi.object().keys({
      publicKey: PUBLIC_KEY_SCHEMA,
      factoryResetMessage: ONION_SCHEMA.required(),
    }).required(),

    validateRegistration: Joi.object({
      publicKey: PUBLIC_KEY_SCHEMA,
      registrationToken: REGISTRATION_TOKEN_SCHEMA,
    }).required(),

    addToMailbox: Joi.object({
      publicKey: PUBLIC_KEY_SCHEMA,
      message: ONION_SCHEMA.required(),
    }).required(),

    getMessages: PUBLIC_KEY_SCHEMA,

    acknowledgeMessage: PUBLIC_KEY_SCHEMA,

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
        publicKey: PUBLIC_KEY_SCHEMA,
      }).required(),

      // What kind of device this is... Eventually we will need some more
      // details here...
      type: TYPE_SCHEMA,

      // Name of this device.
      name: NAME_SCHEMA,

      // A factory reset message if the device was unregistered.
      factoryResetMessage: ONION_SCHEMA.optional(),

      /**
       * TODO: Device registration details are very important details that we
       * should monitor closely... We likely will want to record more details.
       */
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

      mailbox: Joi.array().items(ONION_SCHEMA),
    }).required(),
  };

  genIsRegistrationTokenValid(
    registrarPublicKey: string,
    devicePublicKey: string,
    token: string
  ): Promise<boolean> {
    let accountAccessToken = AccessToken.importPub(registrarPublicKey);
    return accountAccessToken.genVerify(devicePublicKey, token);
  }

  /**
   * Create and register the device in the database.
   *
   * @param {String} registrarPublicKey to validate registration token.
   * @param {Object} payload
   */
  async register(
    registrarPublicKey: string,
    payload: any,
  ): Promise<RegisterOutput | ErrorState> {
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

    const {publicKey} = record.accessToken;

    // Insert the document but do not override any other accounts with the same
    // public key!
    let { result: insert } = await this.collection.update(
      { 'accessToken.publicKey': publicKey }, // query
      { $setOnInsert: record }, // insert only if no duplicates...
      { upsert: true }
    );

    if (insert.n === 1) {
      let device = await this.findByPublicKey(publicKey);
      invariant(device);
      return { id: device._id };
    }

    return this.error('duplicatePublicKey');
  }

  async unregister(
    payload: UnregisterInput,
  ): Promise<UnregisterOutput | ErrorState> {
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
          mailbox: '',
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
  async validateRegistration(
    registrarPublicKey: string,
    payload: ValidateRegistrationInput,
  ): Promise<ValidateRegistrationOutput | ErrorState> {
    payload = this.validate(payload, 'validateRegistration');
    const {publicKey, registrationToken} = payload;

    let device = await this.findByPublicKey(publicKey);
    if (!device) {
      return this.error('unknownDevice');
    }

    const tokenValid = await this.genIsRegistrationTokenValid(
      registrarPublicKey,
      publicKey,
      registrationToken
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

    return { accountDeviceNumber };
  }

  /**
   * Find the device by it's public key (for auth)
   */
  async findByPublicKey(publicKey: string): Promise<?Record> {
    publicKey = this.validate(publicKey, 'findByPublicKey');
    return await this.collection.findOne({
      'accessToken.publicKey': publicKey,
    });
  }

  async findAllByAccount(accountId: ObjectID | string): Promise<Array<Record>> {
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
   ): Promise<boolean> {
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

  async addToMailbox(
    payload: AddToMailboxInput,
  ): Promise<AddToMailboxOutput | ErrorState> {
    payload = this.validate(payload, 'addToMailbox');
    const {publicKey, message} = payload;

    const {
      matchedCount,
      modifiedCount,
      result,
    } = await this.collection.updateOne({
      registered: true,
      'accessToken.publicKey': publicKey,
    }, {
      $addToSet: {
        mailbox: message,
      },
    });

    if (!result.ok) {
      throw new Error(`addToMailbox operation has failed: ` +
                      `${JSON.stringify(result)}`);
    }

    if (matchedCount !== 1) {
      log.warn(`Unknown device`, publicKey);
      return this.error('unknownDevice');
    }

    if (modifiedCount !== 1) {
      log.warn(`Didn't push duplicate message`, publicKey, message);
    }

    return {};
  }

  async getMessages(publicKey: string): Promise<Array<string> | ErrorState> {
    publicKey = this.validate(publicKey, 'getMessages');

    const results = await this.collection.find(
      {
        registered: true,
        'accessToken.publicKey': publicKey,
      },
    ).toArray();

    invariant(results.length <= 1);

    if (!results.length) {
      log.warn(`Unknown device`, publicKey);
      return this.error('unknownDevice');
    }

    const mailbox = results[0].mailbox;
    return mailbox ? mailbox.slice() : [];
  }

  async acknowledgeMessage(
    publicKey: string,
  ): Promise<AcknowledgeMessageOutput | ErrorState> {
    publicKey = this.validate(publicKey, 'acknowledgeMessage');

    const {
      matchedCount,
      modifiedCount,
      result,
    } = await this.collection.updateOne({
      registered: true,
      'accessToken.publicKey': publicKey,
    }, {
      $pop: {
        mailbox: -1,
      },
    });

    if (!result.ok) {
      throw new Error(`acknowledgeMessage operation has failed: ` +
                      JSON.stringify(result));
    }

    if (matchedCount !== 1) {
      log.warn(`Unknown device`, publicKey);
      return this.error('unknownDevice');
    }

    if (modifiedCount !== 1) {
      log.warn(`Failed to pop message, mailbox empty`, publicKey);
    }

    return {};
  }

}
