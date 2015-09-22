/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

/**
Time metadata store.
*/
import * as Joi from 'joi';
import mongo from 'promised-mongo';
import Base from './base';
import formatOutput from './format_output';

const TYPES = Joi.string().only(['log', 'video', 'event']).required();

export default class TimeMetadata extends Base {
  static SCHEMA = {
    metadata: Joi.object().keys({
      deviceId: Joi.string().required(),
      previousId: Joi.string().optional(),
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

    findBeforeTime: Joi.object().keys({
      deviceId: Joi.string().required(),
      metaType: TYPES,
      time: Joi.number().required(),
      maxCount: Joi.number().required()
    }).required(),

    findById: Joi.object().keys({
      id: Joi.string().required()
    }).required()
  };

  static COLLECTION = 'time_metadata';

  async findById(payload) {
    payload = this.validate(payload, 'findById');
    let result = await this.collection.findOne({
      _id: mongo.ObjectId(payload.id), // eslint-disable-line new-cap
    });
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

  async findBeforeTime(payload) {
    payload = this.validate(payload, 'findBeforeTime');
    let result = (await this.collection.find({
      deviceId: payload.deviceId,
      metaType: payload.metaType,
      startUTC: {
        $lte: payload.time
      }
    }).sort({ endUTC: -1 }).limit(payload.maxCount).toArray());
    return result.map(formatOutput);
  }

  /**
   * Insert the next item in the time series.
   */
  async insertNext(payload) {
    payload = this.validate(payload, 'metadata');
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

  async update(id, payload) {
    payload = this.validate(payload, 'update');
    await this.collection.update(
      {
        _id: mongo.ObjectId(id), // eslint-disable-line new-cap
      },
      {
        $set: payload,
      }
    );
    return { id };
  }
}
