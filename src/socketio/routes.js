let log = require('../server/log')('socketio');

// How long a device has to send a livestream message when the server is
// expecting one before it will be disconnected on
const VIDEO_IDLE_TIMEOUT_MS = 10000;


class Device {
  constructor(socket, msg) {
    this.socket = socket;
    Object.assign(this, msg);

    // TODO: Account for device->server transit time and dynamic network
    //       conditions in this offset?
    this.timeOffset = Date.now() - msg.now;

    this.livestream = {
      preview: false,
      video: false,
      diag: false,
    };
  }

  updateLiveStream() {
    let cmd = Object.assign({}, this.livestream);
    cmd.msg = 'livestream';
    log.info('updateLiveStream:', JSON.stringify(cmd));
    this.socket.emit('cmd', cmd);

    this.resetTimeout();
  }

  resetTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    if (this.livestream.preview || this.livestream.video || this.livestream.diag) {
      this.timeout = setTimeout(() => {
        log.info(`Device packet timeout. Disconnecting io=${this.socket.id} id=${this.id}`);
        this.socket.disconnect();
      }, VIDEO_IDLE_TIMEOUT_MS);
    }
  }

  deinit() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}


export default io => {

  function emitNewDevice(socket, device) {
    let msg = { id: device.id, name: device.name};
    if (device.logo.length > 0) {
      Object.assign(msg, {logo: device.logo, previewSize: device.previewSize});
    }
    socket.emit('video-stream-new', msg);
  }

  function emitDeleteDevice(socket, device) {
    let msg = { id: device.id, name: device.name};
    socket.emit('video-stream-delete', msg);
  }

  function emptyRoom(io, room) {
    if (!io.nsps) {
      return true;
    }
    let clients = io.nsps['/'].adapter.rooms[room];
    if (!clients) {
      return true;
    }
    return 0 === clients.length;
  }

  let devices = new Map(); // id => Device

  io.on('connection', socket => {
    log.debug(`New connection. io=${socket.id}`);

    socket.on('join', room => {
      log.debug(`Join room. io=${socket.id} room=${room}`);
      socket.join(room);

      // If a new client has connected, furnish them with a list of the
      // currently connected devices.
      if ('video-streams' === room) {
        devices.forEach(device => emitNewDevice(socket, device));
        return;
      }

      // If a device-specific live stream room was entered, enable that stream
      // on the device.
      let re = /(diag|video|preview)-([0-9a-f]+)/;
      let found = room.match(re);
      if (found) {
        let [, stream, id] = found;
        log.error(`Enabling ${stream} for device id=${id}`);

        let device = devices.get(id);
        if (!device) {
          log.error(`Unknown device id=${id}`);
        } else {
          device.livestream[stream] = true;
          device.updateLiveStream();
        }
      }
    });

    socket.on('leave', room => {
      log.debug(`Leave room. io=${socket.id} room=${room} empty=${emptyRoom(io, room)}`);
      socket.leave(room);
    });

    socket.on('disconnect', err => {
      log.error(`Client disconnect. io=${socket.id} err=${err}`);

      devices.forEach(device => {
        if (device.socket.id === socket.id) {
          emitDeleteDevice(io.to('video-streams'), device);
          device.deinit();
          devices.delete(device.id);
        }
      });
    });

    socket.on('error', err => {
      log.error(`Client socket error: io=${socket.id} ${err.stack}`);
      // TODO: Do something more here, maybe throw?
    });

    // Send a command message from the app to a directed device or every
    // connected device
    socket.on('cmd', msg => {
      if ('id' in msg) {
        let device = devices.get(msg.id);
        if (device) {
          device.socket.emit('cmd', msg);
        } else {
          log.debug(`cmd msg sent to bad device io=${socket.id} id=${msg.id}`);
        }
      } else {
        io.sockets.emit('cmd', msg);
      }
    });

    // Device info message
    socket.on('info', msg => {
      let device;

      if ('id' in msg) {
        device = devices.get(msg.id);
      }

      if (!device) {
        device = new Device(socket, msg);
        device.updateLiveStream();

        devices.set(device.id, device);
        emitNewDevice(io.to('video-streams'), device);
      }

      log.info(`Device info. io=${socket.id} name=${device.name} ` +
               `timeOffset=${device.timeOffset}ms id=${device.id}`);
      device.resetTimeout();
    });


    function sendToDeviceRoom(msg, roomType) {
      let id = msg.id;
      let device = devices.get(id);

      if (!device) {
        log.error(`Disconnecting bad device ("info" packet expected first): ` +
                  `io=${socket.id} id=${id}`);
        socket.disconnect();
        return;
      }
      let deviceRoom = roomType + '-' + id;

      let lag = '';
      if (msg.when) {
        lag = `lag=${Date.now() - msg.when - device.timeOffset}ms`;
      }
      log.verbose(`io=${socket.id} dest:${deviceRoom} ${lag}`);

      // If there are no clients in the room tell the device to stop sending
      // this kind of data
      if (emptyRoom(io, deviceRoom)) {
        log.error(`${deviceRoom} is empty`);
        device.livestream[roomType] = false;
        device.updateLiveStream();
      } else {
        io.to(deviceRoom).emit(deviceRoom, msg);
        device.resetTimeout();
      }
    }

    // Live preview image or video from a device
    socket.on('video', msg => {
      switch (msg.contents) {
      case 'jpeg':
        sendToDeviceRoom(msg, 'preview');
        break;
      case 'mp4':
        sendToDeviceRoom(msg, 'video');
        break;
      default:
        log.error(`Invalid content type: ${msg.contents}`);
        break;
      }
    });

    // Live diag from a device
    socket.on('diag', msg => sendToDeviceRoom(msg, 'diag'));
  });
};
