let log = require('./log')('socketio');

export default function(io) {
  // Real time event stream.
  const VIDEO_IDLE_TIMEOUT_MS = 5000;
  let videoRooms = new Map();
  let roomInfo = room => ({ id: room.id, name: room.name, logo: room.logo });
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
    // re-broadcast command msg to directed node or every connected node
    socket.on('cmd', msg => {
      if ('id' in msg) {
        let room = videoRooms.get(msg.id);
        if (room) {
          room.socket.emit('cmd', msg);
        } else {
          log.debug(`cmd msg sent to bad device io=${socket.id} id=${msg.id}`);
        }
      } else {
        io.sockets.emit('cmd', msg);
      }
    });

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
        socket: socket,
        logo: msg.logo,

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
}
