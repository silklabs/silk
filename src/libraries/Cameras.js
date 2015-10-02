/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import { EventEmitter } from 'events';
import io from 'socket.io-client';
import PreviewQueue from './PreviewQueue';

import Api from './Api';
import mklog from 'log'; const log = mklog('Cameras');

class Camera extends EventEmitter {
  constructor(name, id, logo, previewSize, socket) {
    super();
    this.name = name;
    this.id = id;
    this.previewSize = previewSize;
    this.logs = {};
    this._socket = socket;

    this.logoImage = document.createElement('img');
    let logoArray = new Uint8Array(logo);
    if (logoArray.length > 0) {
      let blob = new Blob([logoArray], { type: 'image/png' });
      this.logoImage.src = URL.createObjectURL(blob);
    }
  }

  deinit() {
    this.logging = false;
    this._previewImageStream(false);
    this._videoClipStream(false);

    URL.revokeObjectURL(this.logoImage.src);
  }

  _feedNewLog(type, data) {
    switch (type) {
    case 'dash':
    case 'procrank':
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
      log.error('Unknown log type', type);
      break;
    }
  }

  set logging(enabled) {
    let diagStream = 'diag-' + this.id;

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
    this.emit('diag');
  }

  on(event, listener) {
    let ret = super.on(event, listener);
    this._adjustRooms(event);
    return ret;
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
      this._previewImageStream(enabled);
      break;
    case 'videoClip':
      this._videoClipStream(enabled);
      break;
    default:
      log.verbose(`Unhandled event: ${event}`);
    }
  }

  _previewImageStream(enabled) {
    let previewStream = 'preview-' + this.id;

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

  _videoClipStream(enabled) {
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
    this.emit('videoClip', this.videoClip);
  }
}

class Cameras extends EventEmitter {
  constructor() {
    super();
    this.cameras = {};
    this.socket = null;
    this.status = `Initializing`;
    Api.socketio.address().then(result => {
      this._changeState(`Connecting to ${result.url}...`);

      this.socket = io(result.url, {
        transports: ['websocket'],
      });

      this.socket.on('connect', () => {
        this._changeState(`Connected to server`);
        this.socket.emit('join', 'video-streams');
      });

      this.socket.on('disconnect', e => {
        let cameras = this.cameras;
        Object.keys(cameras).forEach(id => cameras[id].deinit());

        this.cameras = {};
        this._changeState(`Disconnected from server: ${e}. Reload page!`);
        log.error('Server disconnected');
      });

      this.socket.on('video-stream-new', msg => {
        log.info('New camera', msg.name, msg.id);
        let camera = new Camera(msg.name, msg.id, msg.logo,
                                msg.previewSize, this.socket);
        this.cameras[msg.id] = camera;
        this._changeState(`${Object.keys(this.cameras).length} cameras connected`);
      });

      this.socket.on('video-stream-delete', msg => {
        log.info('Lost camera', msg.name, msg.id);

        let camera = this.cameras[msg.id];
        if (camera) {
          camera.deinit();
          delete this.cameras[msg.id];
          this._changeState(`${Object.keys(this.cameras).length} cameras connected`);
        }
      });

    }).catch(err => {
      this._changeState(`Server connection failure: ${err}`);
      log.error(err.stack);
    });
  }

  _changeState(status) {
    this.status = status;
    this.emit('stateChanged', this);
  }
}

let cameras = new Cameras();
export default cameras;
