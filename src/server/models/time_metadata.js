/* @flow weak */
/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

/**
Time metadata store.
*/
import * as Joi from 'joi';
import mongo from 'promised-mongo';
import Base from './base';
import formatOutput from './format_output';

const TYPES = Joi.string().only(['log', 'video', 'preview', 'event']).required();

// Mongo IDs are 12 bytes long, 24 hex chars.
const MONGO_ID_REGEX = /[0-9a-f]{24}/;

function idQuery(id) {
  if (id.match(MONGO_ID_REGEX)) {
    return {_id: mongo.ObjectId(id)}; // eslint-disable-line new-cap
  }
  return {id};
}

const _idKeys = ['deviceId', 'deviceIds', 'accountId'];
function deviceOrAccountQuery(payload, addlQuery) {
  if (_idKeys.map(key => payload[key]).filter(value => !!value).length !== 1) {
    throw new Error(`Query needs to specify exactly one of ${_idKeys.join(', ')}`);
  }
  let query = {};
  if (payload.deviceId) {
    query.deviceId = payload.deviceId;
  } else if (payload.deviceIds) {
    query.deviceId = { $in: payload.deviceIds };
  } else if (payload.accountId) {
    query.accountId = payload.accountId;
  }
  return Object.assign(query, addlQuery);
}

export default class TimeMetadata extends Base {

  static INDEX = [
    {
      props: {
        id: 1
      },
      /* XXX: We have non unique ids floating around in staging db */
      /* options: { unique: true, sparse: true } */
    },
    {
      props: {
        deviceId: 1
      }
    },
    {
      props: {
        metaType: 1
      }
    },
    {
      props: {
        startUTC: 1
      }
    },
    {
      props: {
        endUTC: 1
      }
    }
  ];

  static SCHEMA = {

    // Mutations

    metadata: Joi.object().keys({
      id: Joi.string().optional(), // Optional for now so we don't break existing clients
      deviceId: Joi.string().required(),

      metaType: TYPES,
      // XXX: Long term these should be more complex types MS is not enough to
      // convey timezone details, etc...
      startUTC: Joi.number().required(),
      endUTC: Joi.number().optional(),
      // Blob as url associated with this item.
      url: Joi.string().optional(),
      // Optional generic data.
      data: Joi.object().optional()
    }).required(),

    update: Joi.object().keys({
      // So far we only support updating the end time.
      endUTC: Joi.number().optional(),
      data: Joi.object().optional(),
    }).required(),

    // Finding events in a time range

    findInTimeInterval: Joi.object().keys({
      // One of these must be specified.
      deviceId: Joi.string().optional(),
      deviceIds: Joi.array().items(Joi.string().required()).optional(),
      accountId: Joi.string().optional(),

      metaType: TYPES,
      startTime: Joi.number().required(),
      endTime: Joi.number().required(),
      maxCount: Joi.number().required()
    }).required(),

    findBeforeTime: Joi.object().keys({
      // One of these must be specified.
      deviceId: Joi.string().optional(),
      deviceIds: Joi.array().items(Joi.string().required()).optional(),
      accountId: Joi.string().optional(),

      metaType: TYPES,
      time: Joi.number().required(),
      maxCount: Joi.number().required()
    }).required(),

    // Finding one specific event

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

  static COLLECTION = 'time_metadata';

  // Finding events in a time range

  async findInTimeInterval(payload) {
    payload = this.validate(payload, 'findInTimeInterval');

    let result = await this.collection.find(deviceOrAccountQuery(payload, {
      metaType: payload.metaType,
      startUTC: {
        $lte: payload.endTime,
      },
      endUTC: {
        $gte: payload.startTime,
      }
    })).sort({ startUTC: -1 }).limit(payload.maxCount).toArray();

    return result.map(formatOutput);
  }

  async findBeforeTime(payload) {
    payload = this.validate(payload, 'findBeforeTime');
    let result = await this.collection.find(deviceOrAccountQuery(payload, {
      metaType: payload.metaType,
      startUTC: {
        $lte: payload.time
      }
    })).sort({ endUTC: -1 }).limit(payload.maxCount).toArray();
    return result.map(formatOutput);
  }

  // Finding one specific event

  async findById(payload) {
    payload = this.validate(payload, 'findById');
    let result = await this.collection.findOne(idQuery(payload.id));
    return formatOutput(result);
  }

  async findNearTime(payload) {
    payload = this.validate(payload, 'findNearTime');

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
    payload = this.validate(payload, 'findOneByTime');
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
    payload = this.validate(payload, 'findOneByTime');
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
   * Insert the next item in the time series.
   */
  async insert(payload) {
    payload = this.validate(payload, 'metadata');
    if (payload.id) {
      return await this.insertOrUpdate(payload);
    }
    let newItem = await this.collection.insert(payload);
    return { id: newItem._id.toString() };
  }

  async update(id, payload) {
    payload = this.validate(payload, 'update');
    await this.collection.update(idQuery(id), {$set: payload});
    return { id };
  }

  async insertOrUpdate(payload) {
    payload = this.validate(payload, 'metadata');
    let { id } = payload;
    if (typeof id !== 'string') {
      throw new Error(`'id' property required.`);
    }

    let existing = await this.collection.findOne({id});
    if (existing) {
      await this.collection.update(
        { _id: mongo.ObjectId(existing._id) },
        { $set: payload }
      );
    } else {
      await this.collection.insert(payload);
    }
    return { id };
  }
}
