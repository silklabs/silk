/**
 * Time metadata store.
 *
 * @flow weak
*/
import * as Joi from 'joi';
import mongo from 'promised-mongo';
import Base from './base';

const TYPES = Joi.string().only(['log', 'video', 'preview', 'event']).required();

// Mongo IDs are 12 bytes long, 24 hex chars.
const MONGO_ID_REGEX = /[0-9a-f]{24}/;

function idQuery(id) {
  if (id.match(MONGO_ID_REGEX)) {
    return {_id: new mongo.ObjectId(id)};
  }
  return {id};
}

const _idKeys = ['deviceId', 'deviceIds'];
function deviceOrAccountQuery(payload, addlQuery) {
  if (_idKeys.map(key => payload[key]).filter(value => !!value).length !== 1) {
    throw new Error(`Query needs to specify exactly one of ${_idKeys.join(', ')}`);
  }
  let query = {};
  if (payload.deviceId) {
    query.deviceId = payload.deviceId;
  } else if (payload.deviceIds) {
    query.deviceId = { $in: payload.deviceIds };
  }
  return Object.assign(query, addlQuery);
}

// XXX: Once again lame to have duplicate type entries.
type Metadata = {
  id: ?string;
  deviceId: string;
  metaType: string;
  startUTC: number;
  endUTC: number;
  url: ?string;
  data: ?{[key: string]: any};
};

type MetadataId = {
  id: string;
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

    findAllInTimeInterval: Joi.object().keys({
      // One of these must be specified.
      deviceId: Joi.string().optional(),
      deviceIds: Joi.array().items(Joi.string().required()).optional(),

      metaType: TYPES,
      startTime: Joi.number().required(),
      endTime: Joi.number().required(),
      maxCount: Joi.number().required()
    }).required(),

    findBeforeTime: Joi.object().keys({
      // One of these must be specified.
      deviceId: Joi.string().optional(),
      deviceIds: Joi.array().items(Joi.string().required()).optional(),

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

  async findAllInTimeInterval(payload): Promise<Array<Metadata>> {
    payload = this.validate(payload, 'findAllInTimeInterval');

    let result = await this.collection.find(deviceOrAccountQuery(payload, {
      metaType: payload.metaType,
      startUTC: {
        $lte: payload.endTime,
      },
      endUTC: {
        $gte: payload.startTime,
      }
    })).sort({ startUTC: -1 }).limit(payload.maxCount).toArray();

    return result.map(this.formatOutput.bind(this));
  }

  async findBeforeTime(payload): Promise<Array<Metadata>> {
    payload = this.validate(payload, 'findBeforeTime');
    let result = await this.collection.find(deviceOrAccountQuery(payload, {
      metaType: payload.metaType,
      startUTC: {
        $lte: payload.time
      }
    })).sort({ endUTC: -1 }).limit(payload.maxCount).toArray();
    return result.map(this.formatOutput.bind(this));
  }

  // Finding one specific event

  async findById(payload): Promise<?Metadata> {
    payload = this.validate(payload, 'findById');
    let result = await this.collection.findOne(idQuery(payload.id));
    return this.formatOutput(result);
  }

  async findNearTime(payload): Promise<?Metadata> {
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
    return this.formatOutput(result);
  }

  async findOneBeforeTime(payload): Promise<?Metadata> {
    payload = this.validate(payload, 'findOneByTime');
    let result = (await this.collection.find({
      deviceId: payload.deviceId,
      metaType: payload.metaType,
      startUTC: {
        $lt: payload.time
      }
    }).sort({ startUTC: -1 }).limit(1).toArray())[0];
    return this.formatOutput(result);
  }

  async findOneAfterTime(payload): Promise<?Metadata> {
    payload = this.validate(payload, 'findOneByTime');
    let result = (await this.collection.find({
      deviceId: payload.deviceId,
      metaType: payload.metaType,
      startUTC: {
        $gt: payload.time
      }
    }).sort({ startUTC: 1 }).limit(1).toArray())[0];
    return this.formatOutput(result);
  }

  /**
   * Insert the next item in the time series.
   */
  async create(payload: Metadata): Promise<MetadataId> {
    payload = this.validate(payload, 'metadata');
    if (payload.id) {
      return await this.createOrUpdate(payload);
    }
    let newItem = await this.collection.insert(payload);
    return { id: newItem._id.toString() };
  }

  async update(id, payload): Promise<MetadataId> {
    payload = this.validate(payload, 'update');
    await this.collection.update(idQuery(id), {$set: payload});
    return { id };
  }

  async createOrUpdate(payload): Promise<MetadataId> {
    payload = this.validate(payload, 'metadata');
    let { id } = payload;
    if (typeof id !== 'string') {
      throw new Error(`'id' property required.`);
    }

    let existing = await this.collection.findOne({id});
    if (existing) {
      await this.collection.update(
        { _id: new mongo.ObjectId(existing._id) },
        { $set: payload }
      );
    } else {
      await this.collection.insert(payload);
    }
    return { id };
  }
}
