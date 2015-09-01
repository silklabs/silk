/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import { resolve } from 'url';
let log = require('./log')('routes');

module.exports = function(opts) {
  let {
    app,
    accounts,
    crashMeta,
    timeMeta,
    config,
    blobs
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

  // Make sure we have the right arguments in place.
  function checkArgs(path, args) {
    app.use(path, (req, res, next) => {
      if (args.some(a => !(a in req.body))) {
        next(new Error('Missing fields in body'));
        return;
      }
      next();
    });
  }

  app.get('/socketio/address', (req, res) => {
    return res.send({ url: config.socketio.publicUrl });
  });

  checkArgs('/account/create', ['email', 'name', 'id', 'passhash', 'sig']);
  app.post('/account/create', (req, res) => {
    let { email, name, id, passhash, sig } = req.body;
    if (!accounts.create(email, name, passhash, id, sig)) {
      // TODO: send back error message
      return res.status(409).json({});
    }
    return res.status(201).json({});
  });

  checkArgs('/account/challenge', ['id']);
  app.post('/account/challenge', (req, res) => {
    let { id } = req.body;
    let receipt = accounts.challengeAccount(id);
    if (!receipt) {
      return res.status(403).json({});
    }
    return res.status(200).json({ receipt: receipt });
  });

  checkArgs('/account/authenticate', ['id', 'receipt', 'sig']);
  app.post('/account/authenticate', (req, res) => {
    let { id, receipt, sig } = req.body;
    let session = accounts.authenticateAccount(id, receipt, sig);
    if (!session) {
      return res.status(401).json({});
    }
    return res.status(200).json({ session: session });
  });

  checkArgs('/account/device/register', ['session', 'name', 'deviceId', 'sig']);
  app.post('/account/device/register', (req, res) => {
    let { session, name, deviceId, sig } = req.body;
    if (!accounts.registerDevice(session, name, deviceId, sig)) {
      // TODO: send back error message
      return res.status(409).json({});
    }
    return res.status(201).json({});
  });

  checkArgs('/device/challenge', ['id']);
  app.post('/device/challenge', (req, res) => {
    let { id } = req.body;
    let receipt = accounts.challengeDevice(id);
    if (!receipt) {
      return res.status(403).json({});
    }
    return res.status(200).json({ receipt: receipt });
  });

  checkArgs('/device/authenticate', ['id', 'receipt', 'sig']);
  app.post('/device/authenticate', (req, res) => {
    let { id, receipt, sig } = req.body;
    let session = accounts.authenticateDevice(id, receipt, sig);
    if (!session) {
      return res.status(401).json({});
    }
    return res.status(200).json({ session: session });
  });

  app.post('/device/metadata/time', asyncRoute(async (req, res) => {
    // create new metadata.
    let result = await timeMeta.insertNext(req.body);
    res.status(201).send(result);
  }));

  app.post('/device/metadata/time/find/byid', asyncRoute(async (req, res) => {
    // create new metadata.
    let result = await timeMeta.findById(req.body);
    let status = result ? 200 : 404;
    res.status(status).send(result);
  }));

  app.post('/device/metadata/time/find/bytime', asyncRoute(async (req, res) => {
    // create new metadata.
    let result = await timeMeta.findNearTime(req.body);
    let status = result ? 200 : 404;
    res.status(status).send(result);
  }));

  app.post('/device/metadata/time/find/bytime/after', asyncRoute(async (req, res) => {
    // create new metadata.
    let result = await timeMeta.findOneAfterTime(req.body);
    let status = result ? 200 : 404;
    res.status(status).send(result);
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

  app.post('/blob/ack', asyncRoute(async (req, res) => {
    await blobHandler.postAck(req, res);
  }));

  app.post('/blob/:type', asyncRoute(async (req, res) => {
    await blobHandler.postBlob(req, res);
  }));

  app.put('/blob/:type/:id', asyncRoute(async (req, res) => {
    if (config.server.blobType !== 'file') {
      res.sendStatus(501);
      return;
    }
    await blobHandler.putBlob(req, res);
  }));

  app.get('/blob/:type/:id', asyncRoute(async (req, res) => {
    if (config.server.blobType !== 'file') {
      res.sendStatus(501);
      return;
    }
    await blobHandler.getBlob(req, res);
  }));
};
