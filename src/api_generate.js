import mkdirp from 'mkdirp';
import path from 'path';
import { generateSchema } from 'api-schema';
import fs from 'fs';

// import all the routes
import vipRoutes from './server/routes/vip';
import accountRoutes from './server/routes/account';
import deviceRoutes from './server/routes/device';
import testRoutes from './server/routes/test';
import blobPublisherRoutes from './server/routes/blob_publisher';

const AUTOGEN_ROOT = path.join(__dirname, '/api/gen');
const GENERATE = {
  vip: {
    routes: vipRoutes,
    base: '../http_client'
  },
  account: {
    routes: accountRoutes,
    base: '../http_client'
  },
  device: {
    routes: deviceRoutes,
    base: '../http_client'
  },
  test: {
    routes: testRoutes,
    base: '../http_client'
  },
  blob: {
    routes: blobPublisherRoutes,
    base: '../http_client'
  }
};

export default function generate() {
  // XXX: The routes should not need any context for this but perhaps we will
  // do something magical later (hopefully not).
  let ctx = {};

  mkdirp.sync(AUTOGEN_ROOT);

  for (let name in GENERATE) {
    let endpoint = GENERATE[name];
    let route = endpoint.routes(ctx);
    let absPath = path.join(AUTOGEN_ROOT, name + '.js');
    fs.writeFileSync(absPath, generateSchema(route.api.toJSON(), {
      baseClassPath: endpoint.base
    }));
  }
}

if (process.mainModule === module) {
  console.log('Building auto generated files');
  generate();
}
