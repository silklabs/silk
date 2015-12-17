/**
 * This file is intended to be included by silk-server and inside of silk-api(s)
 * post install setup and should not be included elsewhere (hence the _).
 */

import mkdirp from 'mkdirp';
import path from 'path';
import generateSchema from 'api-schema/src/gen';
import fs from 'fs';

const AUTOGEN_ROOT = path.join(__dirname, '/gen');

// NOTE: THis is relative to the src/gen folder (so .. is correct).
const CLIENT_MODULE = '../http_client';

// NOTE: That we reference this directly to the top level server folder rather
// then node_modules... This breaks any cicular logic when the server code invokes
// this and ensures we always build the latest code.
const ROUTE_PATH = path.join(__dirname, '../../server/src/server/routes');

// Create list of all the route modules...
const ROUTES = fs.readdirSync(ROUTE_PATH);

export default function generate() {
  // XXX: The routes should not need any context for this but perhaps we will
  // do something magical later (hopefully not).
  let ctx = {};

  mkdirp.sync(AUTOGEN_ROOT);

  for (let name of ROUTES) {
    let routePath = path.join(ROUTE_PATH, name);
    let route;
    try {
      route = require(routePath);
    } catch (err) {
      console.error('Error building client for route', routePath);
      throw err;
    }
    let entrypoint = route(ctx);
    if (!entrypoint) continue;

    let { api } = entrypoint;
    let absPath = path.join(AUTOGEN_ROOT, api.name + '.js');
    console.log(`generating ${absPath}`);
    fs.writeFileSync(absPath, generateSchema(api.toJSON(), {
      baseClassPath: CLIENT_MODULE
    }));
  }
}

if (process.mainModule === module) {
  console.log('Building auto generated files');
  generate();
}
