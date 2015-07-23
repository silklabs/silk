/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';
let log = require('./log')('routes');

module.exports = function(app, io, accounts) {
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

  // Real time event stream.
  const VIDEO_IDLE_TIMEOUT_MS = 5000;
  let videoRooms = new Map();
  let roomInfo = room => ({ id: room.id, name: room.name });
  io.on('connection', socket => {
    log.debug(`New connection. io=${socket.id}`);
    socket.on('join', room => {
      log.debug(`Join room. io=${socket.id} room=${room}`);
      socket.join(room);
      if ('video-streams' === room) {
        for (let [id, videoRoom] of videoRooms) { //eslint-disable-line no-unused-vars
          socket.emit('video-stream-new', roomInfo(videoRoom));
        }
      }
    });
    socket.on('error', err => {
      log.error(`Client socket error: io=${socket.id} ${err}`);
      // TODO: Do something more here?
    });
    socket.on('leave', room => {
      log.debug(`Leave room. io=${socket.id} room=${room}`);
      socket.leave(room);
    });
    // re-broadcast log msg to everyone who is listening to logging
    socket.on('log', msg => io.to('logging').emit('log', msg));
    socket.on('audio', msg => io.to('logging').emit('audio', msg));
    // re-broadcast command msg to every connected node
    socket.on('cmd', msg => io.sockets.emit('cmd', msg));

    function resetDeviceTimeout(id) {
      let room = videoRooms.get(id);
      if (room.timeout) {
        clearTimeout(room.timeout);
      }

      room.timeout = setTimeout(() => {
        io.to('video-streams').emit('video-stream-delete', roomInfo(room));
        log.debug(`Device packet timeout. Deleting id=${id}`);
        videoRooms.delete(id);
      }, VIDEO_IDLE_TIMEOUT_MS);
    }

    // Device info
    socket.on('info', msg => {
      let id = msg.id;
      let newRoom = !videoRooms.has(id);
      let room = {
        id: id,
        name: msg.name,
        // TODO: Account for device->server transit time and dynamic network
        //       conditions
        timeOffset: Date.now() - msg.now,
      };

      if (newRoom) {
        videoRooms.set(id, room);
        io.to('video-streams').emit('video-stream-new', roomInfo(room));
      }

      log.info(`Device info. io=${socket.id} name=${room.name} ` +
                `timeOffset=${room.timeOffset}ms id=${id} new=${newRoom}`);
      resetDeviceTimeout(id);
    });

    // Video streams
    socket.on('video', msg => {
      let id = msg.id;
      let room = videoRooms.get(id);

      if (!room) {
        log.error(`Disconnecting bad client ("info" packet expected first): ` +
                  `io=${socket.id} id=${id}`);
        socket.disconnect();
        return;
      }

      log.verbose(`io=${socket.id} packet:${msg.contents} ` +
                  `lag=${Date.now() - msg.when - room.timeOffset}ms`);

      resetDeviceTimeout(id);
      switch (msg.contents) {
      case 'jpeg':
        // Send preview frames to a special video-preview- room, to
        // allow clients to watch preview streams for multiple videos
        // without having to consume full-bitrate video streams from
        // all cameras.
        //
        // TODO: send preview chunks to the main 'video-streams' room
        // to simplify clients.
        io.to('video-preview-' + id).emit('video-preview-' + id, msg);
        break;
      default:
        // Send all other packets (mp4 chunks and detected-face-data
        // only updates) to the dedicated video channel.
        io.to('video-' + id).emit('video-' + id, msg);
        break;
      }
    });
  });
};
