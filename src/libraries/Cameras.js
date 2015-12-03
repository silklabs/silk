/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import { EventEmitter } from 'events';
import io from 'socket.io-client';
import PreviewQueue from './PreviewQueue';

import Api from './Api';
import mklog from 'log'; const log = mklog('Cameras');

class Camera extends EventEmitter {
  constructor(name, id) {
    super();
    Object.assign(this, {
      name,
      id,
      logs: {},
      logoImage: document.createElement('img'),
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
    this._socket = socket;
    const logo = opts.logo;
    this.previewSize = opts.previewSize;

    if (logo) {
      let logoArray = new Uint8Array(logo);
      if (logoArray.length > 0) {
        let blob = new Blob([logoArray], { type: 'image/png' });
        this.logoImage.src = URL.createObjectURL(blob);
      }
    }
    this.online = true;
    this._updateDiagStream();
    this._updatePreviewImageStream();
    this._updateVideoClipStream();
  }

  setOffline() {
    if (!this.online) {
      return;
    }
    this._updateDiagStream();
    this._updatePreviewImageStream();
    this._updateVideoClipStream();
    this.online = false;

    if (this.logoImage) {
      URL.revokeObjectURL(this.logoImage.src);
    }
    this._socket = null;
    this.previewSize = null;
  }

  _feedNewLog(type, data) {
    switch (type) {
    case 'dash':
      this.logs[type] = data;
      break;
    case 'logcat':
      const maxLines = 500;

      let logcat = this.logs.logcat || [];
      data.split(/\r?\n/).map(line => {
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
      log.warn(`Unknown log type: ${type}`);
      break;
    }
  }

  set logging(enabled) {
    this._requestedRooms.diag = enabled;
    if (this.online) {
      this._updateDiagStream();
    }
  }

  _updateDiagStream() {
    const enabled = this._requestedRooms.diag;
    const diagStream = 'diag-' + this.id;

    if (enabled) {
      log.info('Joining diag stream ' + diagStream);
      this._socket.on(diagStream, this._onDiagStream);
      this._socket.emit('join', diagStream);

    } else {
      log.info('Leaving diag stream ' + diagStream);
      this._socket.removeListener(diagStream, this._onDiagStream);
      this._socket.emit('leave', diagStream);
    }
  }

  _onDiagStream = msg => {
    this._feedNewLog(msg.type, msg.log);
    this.emit('diag', msg);
  }

  on(event, listener) {
    let ret = super.on(event, listener);
    this._adjustRooms(event);
    return ret;
  }

  reboot(channel) {
    let cmd = { id: this.id, msg: 'reboot' };
    if (channel) {
      cmd.channel = channel;
    }
    this._socket.emit('cmd', cmd);
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
      this._requestedRooms[event] = enabled;
      if (this.online) {
        this._updatePreviewImageStream();
        this._updateVideoClipStream();
      }
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
    }

    if (enabled) {
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
      this._socket.removeListener(previewStream, this._onPreviewStream);
      this._socket.emit('leave', previewStream);
      if (this._queue) {
        this._queue.deinit();
        this._queue = null;
      }
    }
  }

  _onPreviewStream = msg => {
    if (!msg) {
      log.warning('_onPreviewStream: null msg');
      return;
    }
    if (!msg.frame) {
      log.warning('_onPreviewStream: null msg.frame');
      return;
    }
    if (this.id !== msg.id) {
      log.warning('Video preview from unknown camera:', msg);
      return;
    }

    log.debug('preview', msg);
    this._queue.push(msg);
  }

  _updateVideoClipStream() {
    const enabled = this._requestedRooms.videoClip;
    let videoStream = 'video-' + this.id;

    if (this.videoClip) {
      URL.revokeObjectURL(this.videoClip);
      this.videoClip = null;
    }

    if (enabled) {
      log.info('Joining video stream ' + videoStream);
      this._socket.on(videoStream, this._onVideoStream);
      this._socket.emit('join', videoStream);

    } else {
      log.info('Leaving video stream ' + videoStream);
      this._socket.removeListener(videoStream, this._onVideoStream);
      this._socket.emit('leave', videoStream);
    }
  }

  _onVideoStream = msg => {
    if (!msg) {
      log.warning('_onVideoStream: null msg');
      return;
    }
    if (!msg.frame) {
      log.warning('_onVideoStream: null msg.frame');
      return;
    }
    if (this.id !== msg.id) {
      log.warning('Video preview from unknown camera:', msg);
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
  }
}

class Cameras extends EventEmitter {
  constructor() {
    super();
    Object.assign(this, {
      cameras: {},
      status: `Initializing`,
      socket: Api.socketioClient(io, 'account'),
      _allDevices: {},
      _liveDevices: {},
    });
    this.socket.open();

    this.socket.on('connect', () => {
      log.info(`Connected to server`);
      this.socket.emit('join', 'video-streams');
    });

    this.socket.on('disconnect', e => {
      log.warn(`Disconnected from server: ${e}`);
      this._liveDevices = {};
      this._update();
    });

    this.socket.on('video-stream-new', msg => {
      log.info(`Device online: ${msg.id}`);
      this._liveDevices[msg.id] = {logo: msg.logo, previewSize: msg.previewSize};
      this._update();
    });

    this.socket.on('video-stream-delete', msg => {
      log.info(`Device offline: ${msg.id}`);
      delete this._liveDevices[msg.id];
      this._update();
    });

    this._loadAllDevices();
  }

  async _loadAllDevices() {
    try {
      const result = await Api.account.listDevices();
      this._allDevices = result.devices;
      this._update();
    } catch (err) {
      log.error(err.stack);
    }
  }

  // Merge |this._allDevices| and |this._liveDevices| into the public list of
  // devices: |this.camera|
  _update() {
    let oldDevices = this.cameras;
    let newDevices = {};

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
      } else {
        newDevices[id].setOffline();
      }
    }

    // Cleanup any devices that no longer exist
    Object.keys(oldDevices).map(id => oldDevices[id].deinit());

    this.cameras = newDevices;

    let status = `${this._allDevices.length} registered devices, `;
    if (this.socket.connected) {
      status += `${Object.keys(this._liveDevices).length} online`;
    } else {
      status += 'socket.io disconnected';
    }

    // Avoid listener leak runtime warning with > 10 devices
    this.setMaxListeners(this._allDevices.length * 2);
    this.status = status;
    this.emit('stateChanged', this);
  }
}

let cameras = new Cameras();
export default cameras;
