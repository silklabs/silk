import assert from 'assert';
import makeDebug from 'debug';
import { validate } from 'joi';
import uuid from 'uuid';

import { HttpAction, HttpApi } from '../types';

const debug = makeDebug('express-schema');

/**
 * A helper class which manages the internal http api state and adds routes to
 * the actual express instances. The intention is we could replace this specific
 * layer with something other then express.
 */
export class ExpressRoutes {
  constructor(app, api = {}) {
    this.app = app;
    this.api = new HttpApi(api);
  }

  define(options, methodFn) {
    assert(typeof methodFn === 'function', 'must pass method function');
    let action = this.api.add(options);

    this.app[action.method.toLowerCase()](action.path, (req, res, next) => {
      try {
        let body = req.body;
        if (action.input) {
          if (!body) {
            let error = {
              code: 400,
              type: 'InputError',
              message: 'Body is required'
            };
            res.status(400).send(error);
            return;
          }

          let validation = validate(body, action.input);
          if (validation.error) {
            let error = {
              code: 400,
              type: 'InputError',
              message: validation.error.message
            };
            res.status(400).send(error);
            return;
          }
        }

        res.respond = (body) => {
          if (action.output) {
            let validation = validate(body, action.output);
            if (validation.error) {
              let id = uuid.v1();
              debug(
                `Invalid response this should never happen (id: ${id})`,
                validation.error.annotate()
              );
              res.status(500).send({
                code: 500,
                id,
                message: `Internal error (id: ${id})`
              });
              return res;
            }
          }
          res.send(body);
          return res;
        };

        // Leave it up to the routing middleware to figure out what to do with the
        // errors simply allow promises to safely exist with express.
        methodFn(req, res).catch(err => {
          next(err);
        });
      } catch (e) {
        let id = uuid.v1();
        debug(`
          Error handling route: ${action.method} ${action.path}
            id: ${id}

            ${e.stack}
        `);
        res.status(500).send({
          code: 500,
          id,
          message: `Internal error (id: ${id})`
        });
        return res;
      }
    });
  }
}

export default function(app, api) {
  return new ExpressRoutes(app, api);
}
