/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

module.exports = function(opts) {
  let {
    app,
    accounts,
    timeMeta,
    config,
    blobs
  } = opts;

  // Eventually we will support multiple blob types via one api but not yet...
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
        next('missing argument');
        return;
      }
      next();
    });
  }

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

  app.post('/device/metadata/', asyncRoute(async (req, res) => {
    // create new metadata.
    let result = await timeMeta.insertNext(req.body);
    res.status(201).send(result);
  }));

  app.post('/device/metadata/find/byid', asyncRoute(async (req, res) => {
    // create new metadata.
    let result = await timeMeta.findById(req.body);
    let status = result ? 200 : 404;
    res.status(status).send(result);
  }));

  app.post('/device/metadata/find/bytime', asyncRoute(async (req, res) => {
    // create new metadata.
    let result = await timeMeta.findNearTime(req.body);
    let status = result ? 200 : 404;
    res.status(status).send(result);
  }));

  app.post('/blob/', asyncRoute(async (req, res) => {
    // Sign a blob upload....
    let putUrl = await blobHandler.sign();
    res.status(201).send({ putUrl });
  }));

  checkArgs('/blob/ack', ['url']);
  app.post('/blob/ack', asyncRoute(async (req, res) => {
    // This looks sketchy because it is in the short term we simply snip off the
    // signature details from our urls if they exist allowing this api to
    // function (providing a long term url or token for a blob).
    res.status(201).send({
      url: req.body.url.split('?')[0]
    });
  }));

  app.get('/blob/:id', asyncRoute(async (req, res) => {
    // XXX: We will eventually want other blob types to go through this url but
    // that should not be an issue as client should use the result of /blob/ack
    // to define their urls not construct them manually.
    if (config.server.blobType !== 'file') {
      res.status(501);
      return;
    }
    await blobHandler.read(req.params.id, res);
    res.status(200).end();
  }));

  app.put('/blob/:id', asyncRoute(async (req, res) => {
    if (config.server.blobType !== 'file') {
      res.status(501);
      return;
    }
    await blobHandler.write(req.params.id, req);
    res.status(201).end();
  }));
};
