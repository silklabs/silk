/* @flow */

import * as Joi from 'joi';
import mongo from 'promised-mongo';
import Base from './base';

let log = require('log')('models-crashreport');

const TYPE_DEVICEID = Joi.string().lowercase().trim().length(66).hex();

export const TYPE_ALL = Joi.string().only([
  'exception',
  'tombstone',
]);

export default class CrashMetadata extends Base {

  static SCHEMA = {
    // Schema for all documents in the database.
    record: Joi.object().keys({
      // The device that generated the report.
      deviceId: TYPE_DEVICEID.required(),

      // The time at which the report was generated.
      timeStamp: Joi.date().iso().required(),

      // The type of report.
      type: TYPE_ALL.required(),

      // The url where the report can be accessed.
      url: Joi.string().trim().uri().required(),
    }).required(),

    // Arguments for the find() function.
    find: Joi.object().keys({
      deviceId: TYPE_DEVICEID.optional(),
      type: TYPE_ALL.optional(),
      startTimeStamp: Joi.date().iso().optional(),
      endTimeStamp: Joi.date().iso().optional(),
      limit: Joi.number().integer().positive().optional(),
    }).required(),

  };

  static COLLECTION: string = 'crash_metadata';

  async create(payload: any): any {
    payload = this.validate(payload, 'record');
    log.info(`Saving new crash report for device '` +
             `${payload.deviceId}'`);

    let record = Object.assign({ }, payload, {
      timeStamp: new Date(payload.timeStamp),
    });

    let newItem = await this.collection.insert(record);

    const id = newItem._id.toString();
    log.debug(`Saved as id '${id}'`);

    return id;
  }

  async get(id: any): any {
    let _id;
    try {
      _id = new mongo.ObjectId(id);
    } catch(e) {
      log.warn(`${e}: '%s'`, id);
      throw e;
    }

    log.info(`Getting crash report with id '${id}'`);

    let result = await this.collection.findOne({
      _id
    });

    result = this.formatOutput(result);

    if (result) {
      log.debug(`Found crash report with id '${id}': '${result.url}'`);
    } else {
      log.warn(`No crash report found with id '${id}'`);
    }

    return result;
  }

  async find(payload: any): any {
    payload = this.validate(payload, 'find');
    log.info('Finding metadata: ' + JSON.stringify(payload));

    let query = { };

    if (payload.deviceId) {
      query.deviceId = payload.deviceId.toLowerCase();
    }
    if (payload.type) {
      query.type = payload.type;
    }
    if (payload.startTimeStamp) {
      query.timeStamp = query.timeStamp || { };
      query.timeStamp.$gte = new Date(payload.startTimeStamp);
    }
    if (payload.endTimeStamp) {
      query.timeStamp = query.timeStamp || { };
      query.timeStamp.$lte = new Date(payload.endTimeStamp);
    }

    const sort = { timeStamp: -1 };
    const limit = ('limit' in payload) ? payload.limit : 0;

    let results =
      await this.collection.find(query).sort(sort).limit(limit).toArray();
    results = results.map(this.formatOutput.bind(this));

    log.debug(`Found ${results.length} results`);
    return results;
  }
}
