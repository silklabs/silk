/**
Time metadata store.
*/
import * as Joi from 'joi';
import mongo from 'promised-mongo';

const TYPES = Joi.string().only(['log', 'video']).required();
const SCHEMA = {
  metadata: Joi.object().keys({
    deviceId: Joi.string().required(),
    previousId: Joi.string().optional(),
    metaType: TYPES,
    // XXX: Long term these should be more complex types MS is not enough to
    // convey timezone details, etc...
    startUTC: Joi.number().required(),
    endUTC: Joi.number().required(),
    // Blob as url associated with this item.
    url: Joi.string().required(),
    // Optional generic data.
    data: Joi.object().optional()
  }).required(),

  findNearTime: Joi.object().keys({
    deviceId: Joi.string().required(),
    metaType: TYPES,
    time: Joi.number().required(),
    strict: Joi.bool()
  }).required(),

  findOneByTime: Joi.object().keys({
    deviceId: Joi.string().required(),
    metaType: TYPES,
    time: Joi.number().required()
  }).required(),

  findById: Joi.object().keys({
    id: Joi.string().required()
  }).required()
};

function formatOutput(record) {
  if (!record) {
    return record;
  }
  if (!('_id' in record)) {
    return record;
  }

  let id = record._id;
  delete record._id;
  record.id = id.toString();
  return record;
}

export default class TimeMetadata {
  constructor(db) {
    this.db = db;
    this.collection = db.collection('time_metadata');
  }

  async findById(payload) {
    Joi.assert(payload, SCHEMA.findById);
    let result = await this.collection.findOne({
      _id: mongo.ObjectId(payload.id), // eslint-disable-line new-cap
    });
    return formatOutput(result);
  }

  async findNearTime(payload) {
    Joi.assert(payload, SCHEMA.findNearTime);

    // First try to find one in the appropriate range...
    let result = await this.collection.findOne({
      deviceId: payload.deviceId,
      metaType: payload.metaType,
      startUTC: {
        $lte: payload.time
      },
      endUTC: {
        $gt: payload.time
      }
    });

    // If that does not work try to find the most recent one.
    if (!result && !payload.strict) {
      return this.findOneBeforeTime(payload);
    }

    return formatOutput(result);
  }

  async findOneBeforeTime(payload) {
    Joi.assert(payload, SCHEMA.findOneByTime);
    let result = (await this.collection.find({
      deviceId: payload.deviceId,
      metaType: payload.metaType,
      startUTC: {
        $lt: payload.time
      }
    }).sort({ startUTC: -1 }).limit(1).toArray())[0];
    return formatOutput(result);
  }

  async findOneAfterTime(payload) {
    Joi.assert(payload, SCHEMA.findOneByTime);
    let result = (await this.collection.find({
      deviceId: payload.deviceId,
      metaType: payload.metaType,
      startUTC: {
        $gt: payload.time
      }
    }).sort({ startUTC: 1 }).limit(1).toArray())[0];
    return formatOutput(result);
  }

  /**
  Insert the next item in the time series.
  */
  async insertNext(payload) {
    Joi.assert(payload, SCHEMA.metadata);
    let newItem = await this.collection.insert(payload);

    if (payload.previousId) {
      // XXX: This part is sketchy and should be part of one transaction later.
      await this.collection.update(
        {
          _id: mongo.ObjectId(payload.previousId), // eslint-disable-line new-cap
        },
        {
          $set: { nextId: newItem._id }
        }
      );
    }

    return { id: newItem._id.toString() };
  }
}
