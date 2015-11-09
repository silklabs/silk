/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import { resolve } from 'url';
import vipRoutes from './routes/vip';
import accountRoutes from './routes/account';
import deviceRoute from './routes/device';
import blobPublisherRoutes from './routes/blob_publisher';

let log = require('log')('routes');

module.exports = function(opts) {
  let {
    app,
    crashMeta,
    timeMeta,
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

  app.get('/socketio/address', (req, res) => {
    return res.send({ url: config.socketio.publicUrl });
  });

  app.post('/device/metadata/time', asyncRoute(async (req, res) => {
    // create new metadata.
    let result = await timeMeta.insert(req.body);
    res.status(201).send(result);
  }));

  app.post('/device/metadata/time/:id', asyncRoute(async (req, res) => {
    // update a metadata record
    let result = await timeMeta.update(req.params.id, req.body);
    res.status(201).send(result);
  }));

  app.post('/device/metadata/time/find/byid', asyncRoute(async (req, res) => {
    let result = await timeMeta.findById(req.body);
    let status = result ? 200 : 404;
    res.status(status).send(result);
  }));

  app.post('/device/metadata/time/find/bytime', asyncRoute(async (req, res) => {
    let result = await timeMeta.findNearTime(req.body);
    let status = result ? 200 : 404;
    res.status(status).send(result);
  }));

  app.post('/device/metadata/time/find/ininterval', asyncRoute(async (req, res) => {
    let result = await timeMeta.findInTimeInterval(req.body);
    let status = result ? 200 : 404;
    res.status(status).send(result);
  }));

  app.post('/device/metadata/time/find/bytime/after', asyncRoute(async (req, res) => {
    let result = await timeMeta.findOneAfterTime(req.body);
    let status = result ? 200 : 404;
    res.status(status).send(result);
  }));

  app.post('/device/metadata/time/find/bytime/before', asyncRoute(async (req, res) => {
    let result = await timeMeta.findBeforeTime(req.body);
    res.status(200).send(result);
  }));

  app.post('/device/metadata/crashreport', asyncRoute(async (req, res) => {
    let id;
    try {
      id = await crashMeta.put(req.body);
    } catch(e) {
      res.sendStatus(400);
      return;
    }

    const getUrl = resolve(config.server.publicUrl,
                           `/device/metadata/crashreport/${id}`);
    res.append('Location', getUrl);
    res.status(201).send({ id });
  }));

  app.get('/device/metadata/crashreport/:id', asyncRoute(async (req, res) => {
    let result;
    try {
      result = await crashMeta.get(req.params.id);
    } catch(e) {
      res.sendStatus(404);
      return;
    }

    if (result) {
      res.status(200).send(result);
    } else {
      res.sendStatus(404);
    }
  }));

  app.post('/device/metadata/crashreport/find', asyncRoute(async (req, res) => {
    let result;
    try {
      result = await crashMeta.find(req.body);
    } catch(e) {
      res.sendStatus(400);
      return;
    }

    if (result) {
      res.status(200).send(result);
    } else {
      res.sendStatus(404);
    }
  }));

  // TODO: Remove me once clients no longer use this version of the API.
  app.post('/blob/ack', asyncRoute(async (req, res) => {
    await blobHandler.postAck(req, res);
  }));

  // TODO: Remove me once clients no longer use this version of the API.
  app.post('/blob/:type', asyncRoute(async (req, res) => {
    await blobHandler.postBlob(req, res);
  }));

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
};
