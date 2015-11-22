import mkdirp from 'mkdirp';
import path from 'path';
import { generateSchema } from 'api-schema';
import fs from 'fs';

const AUTOGEN_ROOT = path.join(__dirname, '/api/gen');
const CLIENT_MODULE = '../http_client';
const ROUTE_PATH = path.join(__dirname, 'server/routes');

// Create list of all the route modules...
const ROUTES = fs.readdirSync(ROUTE_PATH);

export default function generate() {
  // XXX: The routes should not need any context for this but perhaps we will
  // do something magical later (hopefully not).
  let ctx = {};

  mkdirp.sync(AUTOGEN_ROOT);

  for (let name of ROUTES) {
    let route = require(path.join(ROUTE_PATH, name));
    let entrypoint = route(ctx);
    if (!entrypoint) continue;

    let { api } = entrypoint;
    let absPath = path.join(AUTOGEN_ROOT, api.name + '.js');
    fs.writeFileSync(absPath, generateSchema(api.toJSON(), {
      baseClassPath: CLIENT_MODULE
    }));
  }
}

if (process.mainModule === module) {
  console.log('Building auto generated files');
  generate();
}
