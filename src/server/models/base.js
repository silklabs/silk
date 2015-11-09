/* @flow */
import * as Joi from 'joi';

let log = require('log')('models:base');

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

  static INDEX: any;
  static COLLECTION: string;
  static ERROR: any;
  static SCHEMA: any;

  db: any;
  collection: any;

  constructor(db: any) {
    let name = this.constructor.COLLECTION;
    if (!name) {
      throw new Error('Must set "COLLECTION" as static variable.');
    }

    this.db = db;
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

    await Promise.all(indexes.map(async (idx) => {
      log.info(`Adding index to ${desc}`, idx);
      let { props, options } = idx;
      if (!props) {
        throw new Error(`Error adding index to ${desc} you must have .props`);
      }
      await this.collection.ensureIndex(props, options || []);
    }));
  }

  /**
   * Return an error defined in static ERRORS
   *
   * @param {String} name error name.
   * @return {Object} error object with type set to ERROR value.
   */
  error(name: string): any {
    let error = this.constructor.ERROR[name];
    if (!error) {
      throw new Error(`Attempted to use unknown error type: ${name}`);
    }

    // TODO: Add more robust ids or messages.
    return {
      error: {
        type: error
      }
    };
  }

  /**
   * Validates the given object with a schema type.
   *
   * @param {Object} object to validate.
   * @param {String} schema Name of schema (constructor.SCHEMA[name]).
   * @param {Bool} strict when true will disallow unknown properties.
   */
  validate(object: any, schema: string, strict: bool = true) {
    let schemaObject = this.constructor.SCHEMA[schema];
    if (!schemaObject) {
      throw new Error(`Attempted to use unknown schema: ${schema}`);
    }

    let options = {
      allowUnknown: !strict
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
}
