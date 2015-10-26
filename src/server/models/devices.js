/* @flow */
/**
 * We represent each device as a single record in the data store...
 *
 * Note that the devices list here may or may not be unique physical devices we
 * reset the identity entirely between device factory resets.
 */
import * as Joi from 'joi';
import Base from './base';
import { ObjectId } from 'promised-mongo';
import Id from '../../api/id';

const DEVICE_TYPES = [
  'camera'
];

const PUBLIC_KEY = Joi.string().hex().required();
const TYPE_SCHEMA = Joi.string().only(DEVICE_TYPES).required();
// XXX: Max name length was chosen randomly...
const NAME_SCHEMA = Joi.string().min(1).max(60).required();

export default class Devices extends Base {

  static NAME_SCHEMA = NAME_SCHEMA;
  static TYPE_SCHEMA = TYPE_SCHEMA;

  static COLLECTION = 'devices';

  static ERROR = {
    duplicatePublicKey: 'DuplicatePublicKey',
    unknownDevice: 'UnknownDevice',
    invalidRegistrationToken: 'InvalidRegistrationToken'
  };

  static INDEX = [
    {
      props: {
        'publicKey': 1
      },
      options: { unique: true }
    },
    {
      props: {
        'accountId': 1
      }
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
    }),

    validateRegistration: Joi.object({
      publicKey: PUBLIC_KEY,
      registrationToken: Joi.string().required(),
    }),

    // When the record is persisted to disk...
    record: Joi.object().keys({
      // The account which this device belongs to.
      accountId: Joi.object().type(ObjectId).required(),

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

      registration: Joi.object().keys({
        // If the registration of this device has been completed
        complete: Joi.boolean().required(),

        // The registration token for this device (usually the publicKey of this
        // device signed by the private key of an accountToken).
        token: Joi.string().required()
      }).required(),

      /**
       * TODO: Device registration details are very important details that we
       * should monitor closely... We likely will want to record more details.
       */
    })
  };

  registrationTokenValid(registrarPublicKey: string, devicePublicKey: string, token: string): bool {
    let accountAccessToken = Id.importPub(registrarPublicKey);
    return accountAccessToken.verify(devicePublicKey, token);
  }

  /**
   * Create and register the device in the database.
   *
   * @param {String} registrarPublicKey to validate registration token.
   * @param {Object} payload
   */
  async register(registrarPublicKey: string, payload: any): any {
    payload = this.validate(payload, 'register');

    let tokenValid = this.registrationTokenValid(
      registrarPublicKey,
      payload.publicKey,
      payload.registrationToken
    );

    if (!tokenValid) {
      return this.error('invalidRegistrationToken');
    }

    let record = this.validate({
      accountId: ObjectId(payload.accountId),
      createdAt: new Date(),
      type: payload.type,
      name: payload.name,
      registered: true,
      accessToken: {
        publicKey: payload.publicKey
      },
      registration: {
        complete: false,
        token: payload.registrationToken
      }
    }, 'record');

    // Insert the document but do not override any other accounts with the same
    // public key!
    let insert = await this.collection.update(
      { 'accessToken.publicKey': record.accessToken.publicKey }, // query
      { $setOnInsert: record }, // insert only if no duplicates...
      { upsert: true }
    );

    if (insert.n === 1) {
      let device = await this.findByPublicKey({
        publicKey: record.accessToken.publicKey
      });
      return { id: device._id };
    }

    return this.error('duplicatePublicKey');
  }

  async unregister(payload: any): any {
    payload = this.validate(payload, 'unregister');

    let result = await this.collection.update(
      { 'accessToken.publicKey': payload.publicKey },
      {
        $set: {
          registered: false
        }
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
      publicKey: payload.publicKey
    });

    if (!device) {
      return this.error('unknownDevice');
    }

    let tokenValid = this.registrationTokenValid(
      registrarPublicKey,
      payload.publicKey,
      payload.registrationToken
    );

    if (!tokenValid) {
      return this.error('invalidRegistrationToken');
    }

    let update = await this.collection.update(
      { _id: device._id },
      {
        $set: {
          'registration.complete': true
        }
      }
    );

    if (!update.ok) {
      throw new Error(`
        Error in mongodb update:

          ${JSON.stringify(update)}
      `);
    }

    return { success: true };
  }

  /**
   * Find the device by it's public key (for auth)
   */
  async findByPublicKey(payload: any): any {
    payload = this.validate(payload, 'findByPublicKey');
    let { publicKey } = payload;

    return await this.collection.findOne({
      'accessToken.publicKey': publicKey
    });
  }

  async findAllByAccount(accountId: any): any {
    if (!(accountId instanceof ObjectId)) {
      accountId = new ObjectId(accountId);
    }

    return await this.collection.find({
      // Only return devices which are actively registered with the server...
      'registered': true,
      'accountId': accountId
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
        $in: publicKeys
      }
    };

    // Run the query and stick the results in a set so we can verify all
    // the devices belong to the given account.
    let listedPublicKeys = (await this.collection.find(
      query,
      { 'accessToken.publicKey': 1 } // only return accessToken.publicKey
    )).reduce((result, value) => {
      result.add(value.accessToken.publicKey);
      return result;
    }, new Set());

    // Only return true if _every_ single id is inside the given account.
    return publicKeys.every((publicKey) => {
      return listedPublicKeys.has(publicKey);
    });
  }

}
