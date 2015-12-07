/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import vipRoutes from './routes/vip';
import accountRoutes from './routes/account';
import deviceRoute from './routes/device';
import blobPublisherRoutes from './routes/blob_publisher';
import crashPublisherRoutes from './routes/crash_publisher';
import metadataPublisherRoutes from './routes/metadata_publisher';
import metadataRoutes from './routes/metadata';
import crashRoutes from './routes/crash';

let log = require('log')('routes');

module.exports = function(opts) {
  let {
    app,
    config,
    blobs,
  } = opts;

  let blobHandler = blobs[config.server.blobType];
  if (!blobHandler) {
    throw new Error(`Unknown blob handler type: ${config.server.blobType}`);
  }

  /**
  Wrapper so express can handle promise returning routes.
  */
  function asyncRoute(fn) {
    return (req, res) => {
      fn(req, res).catch((err) => {
        log.error('Error responding to route:', req.path, err.stack);
        res.status(500).json({
          // err.stack is nice string output useful for debugging...
          error: err.stack
        });
      });
    };
  }

  // Disable caching.
  app.use((req, res, next) => {
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', 0);
    next();
  });

  /* NOTE: Will be kept to support file blob */
  app.put('/blob/:type/:id', asyncRoute(async (req, res) => {
    if (config.server.blobType !== 'file') {
      res.sendStatus(501);
      return;
    }
    await blobHandler.putBlob(req, res);
  }));

  /**
   * NOTE: We leave this here for demo purposes it should never be used in
   * production. This will not get migrated to the newer (and secured) interfaces.
   */
  app.get('/blob/:type/:id', asyncRoute(async (req, res) => {
    if (config.server.blobType !== 'file') {
      res.sendStatus(501);
      return;
    }
    await blobHandler.getBlob(req, res);
  }));

  app.use(vipRoutes(opts).app);
  app.use(accountRoutes(opts).app);
  app.use(deviceRoute(opts).app);
  app.use(blobPublisherRoutes(opts).app);
  app.use(crashPublisherRoutes(opts).app);
  app.use(metadataPublisherRoutes(opts).app);
  app.use(metadataRoutes(opts).app);
  app.use(crashRoutes(opts).app);
};
