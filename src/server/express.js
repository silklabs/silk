import { HttpAction, HttpApi } from '../types';
import assert from 'assert';
import { validate} from 'joi';
import uuid from 'uuid';

let debug = require('debug')('express-schema');

/**
 * A helper class which manages the internal http api state and adds routes to
 * the actual express instances. The intention is we could replace this specific
 * layer with something other then express.
 */
class ExpressRoutes {
  constructor(app, api = {}) {
    this.app = app;
    this.api = new HttpApi(api);
  }

  define(options, method) {
    let action = new HttpAction(options);
    assert(typeof method === 'function', 'must pass method function');

    let path = this.api.url(action);
    this.app[action.method.toLowerCase()](path, (req, res, next) => {
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
        method(req, res).catch(err => {
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

    this.api.add(action);
  }
}

export default function(app, api) {
  return new ExpressRoutes(app, api);
}
