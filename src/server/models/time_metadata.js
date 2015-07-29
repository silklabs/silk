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
    let result = await this.collection.findOne({
      startUTC: {
        $lte: payload.time
      },
      endUTC: {
        $gt: payload.time
      }
    });
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
