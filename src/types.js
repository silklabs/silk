/**
 * This is a small abstraction based on various other http schema tools it is
 * designed to be an early abstraction around some standard we stick to later.
 */

import * as Joi from 'joi';
import assert from 'assert';
import URL from 'url';
import joiToJSONSchema from 'joi-to-json-schema';

const PARAM = /:[^/]+/g;

/**
 * A representation of a single http action:
 */
export class HttpAction {

  static OPTIONS = Joi.object({
    method: Joi.string(),
    name: Joi.string().required(),
    description: Joi.string(),
    path: Joi.string().required(),
    input: Joi.object().description('Joi instance'),
    output: Joi.object().description('Joi instance'),
    params: Joi.array().items(Joi.object().keys({
      name: Joi.string().required(),
      description: Joi.string()
    }).unknown(false))
  }).required()

  /**
   * The http method used by this route.
   */
  method = 'GET'

  /**
   * Path for the action.
   */
  path = ''

  /**
   * A human readable name for the route (like: "createAccount")
   */
  name = ''

  params = []

  /**
   * Human readable description of what this route does.
   */
  description = ''

  /**
   * The Joi reference to the input allowed to this route.
   */
  input = null

  /**
   * The Joi reference to the output of this route.
   */
  output = null

  constructor(options = {}) {
    Joi.assert(options, this.constructor.OPTIONS);
    Object.assign(this, options);

    let paramCount = this.path.match(PARAM);
    if (paramCount && paramCount.length != this.params.length) {
      throw new Error(`
        Parameter mismatch for ${this.name} action (${this.method} ${this.path})

          Parameters in path: ${paramCount}
          Params defined: ${this.params}

          All params must be defined.
      `);
    }

    this.params.map((current, idx) => {
      // id is param name with leading : sliced off...
      current.id = paramCount[idx].slice(1);
      return current;
    })
  }

  toJSON() {
    let result = Object.assign({}, this);
    if (result.input) {
      result.input = joiToJSONSchema(result.input);
    }

    if (result.output) {
      result.output = joiToJSONSchema(result.output);
    }
    return result;
  }
}


/**
 * A representation of the overall http api.
 */
export class HttpApi {

  static OPTIONS = Joi.object({
    name: Joi.string(),
    description: Joi.string(),
    prefix: Joi.string()
  }).required()

  /**
   * The name of this http api:
   */
  name = ''

  /**
   * The description of what this api does.
   */
  description = ''

  /**
   * The prefix path which this http api operates under.
   */
  prefix = '/'

  // list of actions
  actions = []

  constructor(options = {}) {
    Joi.assert(options, this.constructor.OPTIONS);
    Object.assign(this, options);
  }

  /**
   * Add a http route to this api.
   */
  add(action) {
    assert(action instanceof HttpAction, 'route must be an HttpAction');
    this.actions.push(action);
  }

  url(action) {
    assert(action instanceof HttpAction, 'route must be an HttpAction');
    return URL.resolve(this.prefix, action.path);
  }

  toJSON() {
    let result = Object.assign({}, this);
    result.actions = result.actions.map(action => action.toJSON());
    return result;
  }
}

