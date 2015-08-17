/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

import loadConfig from '../../src/server/config';
import createServer from '../../src/socketio/server';
import merge from 'lodash.merge';

/**
Main sets up and configures the test context...
*/
export default function createContext(overrides = {}) {
  let context = {};

  setup(async () => {
    let config = merge({}, loadConfig('test'), overrides);
    let server = await createServer(config);

    context.config = config;
    context.server = server;
    context.url = `http://localhost:${server.port}`;
  });

  teardown(async () => {
    await context.server.close();
  });

  return context;
}
