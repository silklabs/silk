
import { EventEmitter } from 'events';
import io from 'socket.io-client';
import PreviewQueue from './PreviewQueue';
import invariant from 'assert';

import Api from './Api';
import mklog from 'silk-log'; const log = mklog('Cameras');

class Camera extends EventEmitter {
  constructor(name, id) {
    super();
    Object.assign(this, {
      name,
      id,
      logs: {},
      _requestedRooms: {},
    });
    this.setOffline();
  }

  deinit() {
    this.setOffline();
  }

  setOnline(socket, opts) {
    if (this.online) {
      return;
    }
    this.online = true;
    this._socket = socket;
    const logo = opts.logo;
    this.previewSize = opts.previewSize;

    this.logoImage = document.createElement('img');
    if (logo) {
      let logoArray = new Uint8Array(logo);
      if (logoArray.length > 0) {
        let blob = new Blob([logoArray], { type: 'image/png' });
        this.logoImage.src = URL.createObjectURL(blob);
      }
    }
    this._updateStreams();
  }

  setOffline() {
    if (!this.online) {
      return;
    }
    this.online = false;

    if (this._socket) {
      this._updateStreams();
    }

    if (this.logoImage) {
      URL.revokeObjectURL(this.logoImage.src);
      this.logoImage = null;
    }
    this._socket = null;
    this.previewSize = null;
  }

  set logging(enabled) {
    this._requestedRooms.diag = enabled;
    this._updateDiagStream();
  }

  _updateStreams() {
    this._updateDiagStream();
    this._updatePreviewImageStream();
    this._updateVideoClipStream();
    this._updateMicStream();
  }

  _updateDiagStream() {
    const enabled = this._requestedRooms.diag;
    const diagStream = 'diag-' + this.id;

    if (this.online && enabled) {
      log.info('Joining diag stream ' + diagStream);
      this._socket.on(diagStream, this._onDiagStream);
      this._socket.emit('join', diagStream);

    } else {
      log.info('Leaving diag stream ' + diagStream);
      if (this._socket) {
        this._socket.removeListener(diagStream, this._onDiagStream);
        this._socket.emit('leave', diagStream);
      }
    }
  }

  _onDiagStream = (msg, ack) => {
    if (typeof ack === 'function') {
      ack();
    }
    switch (msg.type) {
    case 'log':
      switch (msg.name) {
      case 'dash':
        this.logs.dash = msg.log;
        break;
      case 'logcat':
        const maxLines = 500;

        let logcat = this.logs.logcat || [];
        msg.log.split(/\r?\n/).map(line => {
          if (line.length > 0) {
            logcat.push(line);
          }
        });
        while (logcat.length > maxLines) {
          logcat.shift();
        }
        this.logs.logcat = logcat;
        break;
      default:
        log.warn(`Unknown diag log name: ${msg.name}`);
        return;
      }
      this.emit('diag');
      break;
    case 'jpegFrames':
      this.emit('diagJpegFrames', msg.frames);
      break;
    case 'state':
      switch (msg.name) {
      case 'camera':
      case 'timeline':
        this.emit(`diagState:${msg.name}`, msg.state);
        break;
      default:
        log.warn(`Unknown diag state name: ${msg.name}`);
        break;
      }
      break;
    default:
      log.warn(`Unknown diag type: ${msg.type}`);
      return;
    }
  };

  on(event, listener) {
    let ret = super.on(event, listener);
    this._adjustRooms(event);
    return ret;
  }

  reboot(channel) {
    if (!this.online) {
      return;
    }
    let cmd = { id: this.id, msg: 'reboot' };
    if (channel) {
      cmd.channel = channel;
    }
    this._socket.emit('cmd', cmd);
  }

  diagCommand(subsystem: string, name: string, arg: string = '') {
    invariant(subsystem.length > 0);
    invariant(name.length > 0);

    if (!this.online) {
      return;
    }
    let cmd = { id: this.id, msg: 'diagCommand', subsystem, name, arg };
    this._socket.emit('cmd', cmd);
  }

  diagCameraCommand(name: string, arg: string = '') {
    this.diagCommand('camera', name, arg);
  }

  speak(lib: string, text: string) {
    this.diagCommand('speak', text, lib);
  }

  removeListener(event, listener) {
    let ret = super.removeListener(event, listener);
    this._adjustRooms(event);
    return ret;
  }

  _adjustRooms(event) {
    let count = super.listeners(event).length;
    let enabled = count > 0;

    switch (event) {
    case 'previewImage':
    case 'videoClip':
    case 'micData':
      this._requestedRooms[event] = enabled;
      this._updatePreviewImageStream();
      this._updateVideoClipStream();
      this._updateMicStream();
      break;
    default:
      log.verbose(`Unhandled event: ${event}`);
    }
  }

  _updatePreviewImageStream() {
    const enabled = this._requestedRooms.previewImage;
    const previewStream = 'preview-' + this.id;

    if (this.previewImage) {
      URL.revokeObjectURL(this.previewImage.src);
      this.previewImage = null;
    }

    if (this.online && enabled) {
      log.info('Joining preview stream ' + previewStream);
      this.previewImage = document.createElement('img');
      this._socket.on(previewStream, this._onPreviewStream);
      this._socket.emit('join', previewStream);

      this._queue = new PreviewQueue(this.name, msg => {
        this.previewTimestamp = new Date(msg.when);
        this.previewObjects = msg.objects;

        let view = new Uint8Array(msg.frame);
        let blob = new Blob([view], { type: 'image/jpg' });

        if (this.previewImage) {
          URL.revokeObjectURL(this.previewImage.src);
        }
        this.previewImage.onload = () => this.emit('previewImage');
        this.previewImage.src = URL.createObjectURL(blob);
      });

    } else {
      log.info('Leaving preview stream ' + previewStream);
      if (this._socket) {
        this._socket.removeListener(previewStream, this._onPreviewStream);
        this._socket.emit('leave', previewStream);
      }
      if (this._queue) {
        this._queue.deinit();
        this._queue = null;
      }
    }
  }

  _onPreviewStream = (msg, ack) => {
    if (typeof ack === 'function') {
      ack();
    }
    if (!msg) {
      log.warn('_onPreviewStream: null msg');
      return;
    }
    if (!msg.frame) {
      log.warn('_onPreviewStream: null msg.frame');
      return;
    }
    log.debug('preview', msg);
    this._queue.push(msg);
  };

  _updateVideoClipStream() {
    const enabled = this._requestedRooms.videoClip;
    let videoStream = 'video-' + this.id;

    if (this.videoClip) {
      URL.revokeObjectURL(this.videoClip);
      this.videoClip = null;
    }

    if (this.online && enabled) {
      log.info('Joining video stream ' + videoStream);
      this._socket.on(videoStream, this._onVideoStream);
      this._socket.emit('join', videoStream);

    } else {
      log.info('Leaving video stream ' + videoStream);
      if (this._socket) {
        this._socket.removeListener(videoStream, this._onVideoStream);
        this._socket.emit('leave', videoStream);
      }
    }
  }

  _onVideoStream = (msg, ack) => {
    if (typeof ack === 'function') {
      ack();
    }
    if (!msg) {
      log.warn('_onVideoStream: null msg');
      return;
    }
    if (!msg.frame) {
      log.warn('_onVideoStream: null msg.frame');
      return;
    }
    log.debug('video', msg);

    let view = new Uint8Array(msg.frame);
    let blob = new Blob([view], { type: 'video/mp4' });
    if (this.videoClip) {
      URL.revokeObjectURL(this.videoClip);
    }
    this.videoClip = URL.createObjectURL(blob);
    this.emit('videoClip', this.videoClip, new Date(msg.when), view);
  };

  _updateMicStream() {
    const enabled = this._requestedRooms.micData;
    let stream = 'mic-' + this.id;

    if (this.micData) {
      this.micData = null;
    }

    if (this.online && enabled) {
      log.info('Joining mic stream ' + stream);
      this._socket.on(stream, this._onMicStream);
      this._socket.emit('join', stream);
    } else {
      log.info('Leaving mic stream ' + stream);
      if (this._socket) {
        this._socket.removeListener(stream, this._onMicStream);
        this._socket.emit('leave', stream);
      }
    }
  }

  _onMicStream = (msg, ack) => {
    if (typeof ack === 'function') {
      ack();
    }
    if (!msg) {
      log.warn('_onMicStream: null msg');
      return;
    }
    this.micData = msg;
    this.emit('micData', msg);
  };
}

class Cameras extends EventEmitter {
  constructor() {
    super();
    Object.assign(this, {
      cameras: {}, // indexed by device id
      status: 'Initializing...',
      socket: null,
      _allDevices: [], // unmodified result from Api.account.listDevices()
      _liveDevices: {}, // indexed by device id
    });
  }

  async connect() {
    this.status = 'Connecting...';

    try {
      this._updateStatus('Fetching device list...');
      const result = await Api.account.listDevices();
      this._allDevices = result.devices;
      this._update();

      this.socket = Api.socketioClient(io, 'account');
      this.socket.open();

      this.socket.on('connect', () => {
        log.info(`Connected to server`);
        this.socket.emit('join', 'video-streams');
        this._update();
      });

      this.socket.on('disconnect', e => {
        log.warn(`Disconnected from server: ${e}`);
        this._liveDevices = {};
        this._update();
      });

      this.socket.on('video-stream-new', msg => {
        log.info(`Device online: ${msg.id} ` +
                 `previewSize:${JSON.stringify(msg.previewSize)}`);
        this._liveDevices[msg.id] = {logo: msg.logo, previewSize: msg.previewSize};
        this._update();
      });

      this.socket.on('video-stream-delete', msg => {
        log.info(`Device offline: ${msg.id}`);
        delete this._liveDevices[msg.id];
        this._update();
      });
    } catch (err) {
      log.error(err.stack);
      this._updateStatus(`Initialization failed: ${err}`);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
    this.socket = null;
    this._updateStatus('Disconnected');
  }

  // Merge |this._allDevices| and |this._liveDevices| into the public list of
  // devices: |this.camera|
  _update() {
    let oldDevices = this.cameras;
    let newDevices = {};

    let unregisteredLiveDevices = Object.keys(this._liveDevices);
    for (const device of this._allDevices) {
      const id = device.deviceId;
      if (newDevices[id]) {
        // Server bug?  Sometimes the same device Id occurs multiple times
        log.error(`Ignoring duplicate device: ${id}`);
        continue;
      }

      if (oldDevices[id]) {
        newDevices[id] = oldDevices[id];
        delete oldDevices[id];
      } else {
        newDevices[id] = new Camera(device.name, id);
      }

      if (this._liveDevices[id]) {
        newDevices[id].setOnline(this.socket, this._liveDevices[id]);
        unregisteredLiveDevices.splice(unregisteredLiveDevices.indexOf(id), 1);
      } else {
        newDevices[id].setOffline();
      }
    }

    // Cleanup any devices that no longer exist
    Object.keys(oldDevices).map(id => oldDevices[id].deinit());

    // There should never be any unregistered devices...
    for (const id of unregisteredLiveDevices) {
      newDevices[id] = new Camera('!! UNKNOWN DEVICE !!', id);
      newDevices[id].setOnline(this.socket, this._liveDevices[id]);
    }

    this.cameras = newDevices;

    let status = `${this._allDevices.length} registered devices, `;
    if (this.socket && this.socket.connected) {
      status += `${Object.keys(this._liveDevices).length} online`;
      if (unregisteredLiveDevices.length > 0) {
        status += `, ${unregisteredLiveDevices.length} online but unregistered`;
      }
    } else {
      status += 'socket.io disconnected';
    }

    // Avoid listener leak runtime warning with > 10 devices
    this.setMaxListeners(this._allDevices.length * 2);
    this._updateStatus(status);
  }

  _updateStatus(status) {
    this.status = status;
    this.emit('stateChanged', this);
  }
}

let cameras = new Cameras();
export default cameras;
