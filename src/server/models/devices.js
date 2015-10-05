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

  static NAME_SCHEMA = NAME_SCHEMA
  static TYPE_SCHEMA = TYPE_SCHEMA

  static COLLECTION = 'devices'

  static ERROR = {
    duplicatePublicKey: 'DuplicatePublicKey',
    unknownDevice: 'UnknownDevice',
    invalidRegistrationToken: 'InvalidRegistrationToken'
  }

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
  ]

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
  }

  registrationTokenValid(accountPublicKey, devicePublicKey, token) {
    let accountAccessToken = Id.importPub(accountPublicKey);
    return accountAccessToken.verify(devicePublicKey, token);
  }

  /**
   * Create and register the device in the database.
   *
   * @param {String} accountPublicKey to validate registration token.
   * @param {Object} payload
   */
  async register(accountPublicKey, payload) {
    payload = this.validate(payload, 'register');

    let tokenValid = this.registrationTokenValid(
      accountPublicKey,
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
      { 'accessToken.publicKey': record.publicKey }, // query
      { $setOnInsert: record }, // insert only if no duplicates...
      { upsert: true }
    );

    let didInsert = insert.upserted;
    if (didInsert && didInsert[0]._id) {
      return { id: didInsert[0]._id.toString() };
    }

    return this.error('duplicatePublicKey');
  }

  async unregister(payload) {
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
   * @param {String} accountPublicKey to validate registration token.
   * @param {Object} payload for validate.
   */
  async validateRegistration(accountPublicKey, payload) {
    payload = this.validate(payload, 'validateRegistration');

    let device = await this.findByPublicKey({
      publicKey: payload.publicKey
    });

    if (!device) {
      return this.error('unknownDevice');
    }

    let tokenValid = this.registrationTokenValid(
      accountPublicKey,
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
  async findByPublicKey(payload) {
    payload = this.validate(payload, 'findByPublicKey');
    let { publicKey } = payload;

    return await this.collection.findOne({
      'accessToken.publicKey': publicKey
    });
  }

  async findAllByAccount(accountId) {
    if (!(accountId instanceof ObjectId)) {
      accountId = new ObjectId(accountId);
    }

    return await this.collection.find({
      // Only return devices which are actively registered with the server...
      'registered': true,
      'accountId': accountId
    }).toArray();
  }

}
