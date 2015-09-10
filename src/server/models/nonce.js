/**
 * Collection for storing nonce values. The collection is designed to be
 * periodically purged of values which have expired. In the event the collection
 * is never purged security will be preserved at the expense of space.
 */
import * as Joi from 'joi';
import Base from './base';

const UUID = Joi.string().guid().required();

export default class Nonce extends Base {
  static ERROR = {
    duplicateValue: 'DuplicateUUIDValue',
  }


  static INDEX = [
    /**
     * Nonce value must be unique...
     */
    {
      props: {
        value: 1
      },
      options: { unique: true }
    },

    /**
     * Index dates for fast expiry.
     */
    {
      props: {
        expires: 1
      }
    }
  ]

  static SCHEMA = {
    record: Joi.object().keys({
      // XXX: A UUID is pretty long what else can we use?
      //
      // nonce should typically be a UUID in the case of collision the client
      // must retry with a new value.
      value: UUID,
      created: Joi.date().required(),
      expires: Joi.date().required()
    }).required(),

    check: Joi.object().keys({
      value: Joi.string()
    }).required()
  }

  static COLLECTION = 'nonce'

  /**
   * Create a nonce value.
   */
  async create(payload) {
    payload = this.validate(payload, 'record');

    let insert = await this.collection.update(
      // Search...
      {
        value: payload.value
      },
      // Insert (only happens if search fails to find something)
      {
        $setOnInsert: payload
      },
      { upsert: true }
    );

    let didInsert = insert.upserted;
    if (didInsert && didInsert[0]._id) {
      return { id: didInsert[0]._id.toString() };
    }

    return this.error('duplicateValue');
  }

  /**
   * Check if a nonce value exists.
   */
  async check(payload) {
    payload = this.validate(payload, 'check');
    return this.collection.findOne({
      value: payload.value
    });
  }

  /**
   * Remove any expired records from the collection.
   *
   * Note: MongoDB can do this natively without any additional server logic but
   * this method was chosen for interoperability if we ever change stores.
   */
  async expireAll() {
    return await this.collection.remove({
      expires: {
        $lte: new Date()
      }
    });
  }
}
