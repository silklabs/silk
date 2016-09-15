/* @flow */
import * as Joi from 'joi';
import createLog from 'silk-log';

export const PUBLIC_KEY_SCHEMA = Joi.string().hex().required();
export const FIND_BY_PUBLIC_KEY_SCHEMA = Joi.object({
  publicKey: PUBLIC_KEY_SCHEMA,
}).required();

const log = createLog('models:base');

export type ErrorState = {
  error: {
    type: string;
  };
};

// XXX: Sadly we need to re-declare Error to add captureStackTrace.
declare class Error {
  static (message?:string):Error;
  name: string;
  message: string;
  stack: string;
  static captureStackTrace(ctx: any, fn: any): void;
}

class SchemaError extends Error {
  type: string;
  schema: any;

  constructor(msg) {
    super();
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
    this.message = msg;
    this.stack = `${this.name}: ${this.message}\n ${this.stack}`;
  }
}

/**
 * Provides basic structure for classes which deal with our datastore.
 */
export default class Base {

  static PUBLIC_KEY_SCHEMA = PUBLIC_KEY_SCHEMA;
  static FIND_BY_PUBLIC_KEY_SCHEMA = FIND_BY_PUBLIC_KEY_SCHEMA;

  static INDEX: any;
  static COLLECTION: string;
  static ERROR: any;
  static SCHEMA: any;

  db: any;
  blobHandler: any;
  collection: any;

  constructor(db: any, blobHandler: any) {
    let name = this.constructor.COLLECTION;
    if (!name) {
      throw new Error('Must set "COLLECTION" as static variable.');
    }

    this.db = db;
    this.blobHandler = blobHandler;
    this.collection = db.collection(name);
  }

  /**
   * Ensures indexes have been initialized for this particular collection.
   *
   * Index fields are defined as a class static `INDEX`.
   */
  async ensureIndexes(): Promise<void> {
    let indexes = this.constructor.INDEX;
    let name = this.constructor.name;
    let collectionName = this.constructor.COLLECTION;
    let desc = `${name} (${collectionName})`;

    if (!indexes) {
      log.info(`Skipping indexing ${desc} no indexes`);
      return;
    }

    await Promise.all(indexes.map((idx) => {
      log.info(`Adding index to ${desc}`, idx);
      let { props, options } = idx;
      if (!props) {
        throw new Error(`Error adding index to ${desc} you must have .props`);
      }
      return this.collection.ensureIndex(props, options || []);
    }));
  }

  /**
   * Return an error defined in static ERRORS
   *
   * @param {String} name error name.
   * @return {Object} error object with type set to ERROR value.
   */
  error(name: string): ErrorState {
    const type = this.constructor.ERROR[name];
    if (!type) {
      throw new Error(`Attempted to use unknown error type: ${name}`);
    }

    // TODO: Add more robust ids or messages.
    return {
      error: {type},
    };
  }

  /**
   * Validates the given object with a schema type.
   *
   * @param {Object} object to validate.
   * @param {String} schema Name of schema (constructor.SCHEMA[name]).
   * @param {Bool} strict when true will disallow unknown properties.
   */
  validate(object: any, schema: string, strict: bool = true): any {
    let schemaObject = this.constructor.SCHEMA[schema];
    if (!schemaObject) {
      throw new Error(`Attempted to use unknown schema: ${schema}`);
    }

    let options = {
      allowUnknown: !strict,
    };

    let validation = Joi.validate(object, schemaObject, options);
    if (validation.error) {
      // Log out any schema validation errors.
      log.warn(
        `[(${this.constructor.name}) ${schema}] ${validation.error}: %j`,
        object
      );

      // Annotate will produce a nice human readable error.
      let error = new SchemaError(
        `
         Object is not a valid schema for ${schema}

        ${validation.error.annotate()}
        `
      );

      error.type = 'schema';
      error.schema = schemaObject;
      throw error;
    }

    return validation.value;
  }

  /**
   * Formats a given object
   *   1) converts mongodb style _id to .id.
   *   2) converts url to an object containing the signed url and
   *      request headers
   *
   * Mutates input!
   *
   * @param {Object} object to format.
   */
  formatOutput(record: any): any {
    if (record) {
      if ('_id' in record) {
        let id = record._id;
        delete record._id;
        record.id = id.toString();
      }
      if ('url' in record && this.blobHandler) {
        record.url = this.blobHandler.getSignedUrl(record.url);
      }
    }

    // Explicitly return null so we can use results /w Joi validation.
    if (record === undefined) {
      return null;
    }

    return record;
  }

}
