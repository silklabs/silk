
import config from 'silk-config';
import { EventEmitter } from 'events';
import io from 'socket.io-client';
import invariant from 'assert';
import createLog from 'silk-log';
import { call } from 'silk-rtc';

import Api from './Api';
import ObjectCollector from './ObjectCollector';
import PreviewQueue from './PreviewQueue';

const log = createLog('Cameras');

class Camera extends EventEmitter {
  id = '';
  logoImage = null;
  logs = {};
  name = '';
  objects = null;
  online = false;
  previewImage = null;
  previewSize = null;
  previewTimestamp = null;
  lastSeenAt: Date;

  _requestedRooms = { };
  _socket = null;
  _queue = null;
  _peer = null;
  _channel = null;

  constructor(name, id) {
    super();
    this.name = name;
    this.id = id;
  }

  deinit() {
    this.setOffline(this.lastSeenAt);
  }

  getPeer() {
    return this._peer;
  }

  setPeer(peer) {
    const channel = peer.getChannel('video');
    const previous = this._channel;

    this._peer = peer;
    this._channel = channel;
    this.emit('peer', peer);

    if (previous !== channel) {
      log.info(`Updating webrtc status for ${this.id}`);
      this._updateStreams();
    }
  }

  setOnline(socket, opts) {
    if (this.online) {
      return;
    }
    this.online = true;
    this._socket = socket;
    this.previewSize = opts.previewSize;
    this.objectsSize = opts.objectsSize;

    const logo = opts.logo;
    if (logo) {
      const view = new Uint8Array(logo);
      if (view.length) {
        this.logoImage = new Blob([view], { type: 'image/png' });
      }
    }

    const {width, height} = opts.objectsSize;
    this.objects = new ObjectCollector(width, height);

    this._updateStreams();
  }

  setOffline(lastSeenAt: Date) {
    this.lastSeenAt = lastSeenAt;
    if (!this.online) {
      return;
    }
    this.online = false;

    if (this._socket) {
      this._updateStreams();
    }

    this.logoImage = null;
    this.objects = null;
    this.previewImage = null;
    this._socket = null;
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
    this._updateObjectStream();
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
        // Lexical scope ...
        {
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
        }
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

  addListener(event, listener) {
    let ret = super.addListener(event, listener);
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
    case 'videoClip':
    case 'micData':
      this._requestedRooms[event] = enabled;
      this._updatePreviewImageStream();
      this._updateVideoClipStream();
      this._updateMicStream();
      this._updateObjectStream();
      break;
    default:
      log.verbose(`Unhandled event: ${event}`);
    }
  }

  _updatePreviewImageStream() {
    const enabled = this._requestedRooms.previewImage;
    const previewStream = 'preview-' + this.id;

    this.previewImage = null;

    if (this.online && enabled) {
      log.info('Joining preview stream ' + previewStream);

      if (this._channel) {
        console.log('using previews from webrtc!');
        this._channel.on('jpeg', this._onPreviewStream);
        this._socket.removeListener(previewStream, this._onPreviewStream);
      } else {
        this._socket.on(previewStream, this._onPreviewStream);
      }
      this._socket.emit('join', previewStream);

      this._queue = new PreviewQueue(this.name, msg => {
        if (msg.frame.size) {
          this.previewImage = msg.frame;
          this.previewTimestamp = new Date(msg.when);
          this.emit('previewImage', this.previewImage);
        }
      });

    } else {
      log.info('Leaving preview stream ' + previewStream);

      if (this._channel) {
        this._channel.removeListener('jpeg', this._onPreviewStream);
      }

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
    if (msg.frame instanceof ArrayBuffer) {
      // socket.io still sends ArrayBuffer
      msg.frame = new Blob([msg.frame], { type: 'image/jpg' });
    }
    if (!msg || !msg.frame || !msg.frame.size || !msg.when) {
      log.warn('Received bad preview message', msg);
      return;
    }
    log.info(`Received preview message networkLag=${Date.now() - msg.deviceEmitMs} ${msg}`);
    this._queue.push(msg);
  };

  _updateVideoClipStream() {
    const enabled = this._requestedRooms.videoClip;
    let videoStream = 'video-' + this.id;

    if (this.online && enabled) {
      log.info('Joining video stream ' + videoStream);
      if (this._channel) {
        console.log('using webrtc video stream...');
        this._channel.on('mp4', this._onVideoStream);
        this._socket.removeListener(videoStream, this._onVideoStream);
      } else {
        this._socket.on(videoStream, this._onVideoStream);
      }
      this._socket.emit('join', videoStream);
    } else {
      log.info('Leaving video stream ' + videoStream);
      if (this._socket) {
        this._socket.removeListener(videoStream, this._onVideoStream);
        this._socket.emit('leave', videoStream);
      }

      if (this._channel) {
        this._channel.removeListener('mp4', this._onVideoStream);
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
    log.debug(`Received video message networkLag=${Date.now() - msg.deviceEmitMs} ${msg}`);
    this.emit('videoClip', msg.frame, msg.when);
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
    if (config.deviceMic.bytesPerSample === 2
        && config.deviceMic.encoding === 'signed-integer'
        && config.deviceMic.endian === 'little') {
      msg.samples = new Int16Array(msg.samples);
    } else {
      throw new Error(`Unhandled deviceMic configuration: ${config.deviceMic}`);
    }
    this.micData = msg;
    this.emit('micData', msg);
  };

  _updateObjectStream() {
    const enabled =
      this._requestedRooms.videoClip || this._requestedRooms.previewImage;
    const stream = 'objects-' + this.id;

    if (this.online && enabled) {
      log.info(`Joining '${stream}'`);
      this._socket.on(stream, this._onObjectStream);
      this._socket.emit('join', stream);
    } else {
      log.info(`Leaving '${stream}'`);
      if (this._socket) {
        this._socket.removeListener(stream, this._onObjectStream);
        this._socket.emit('leave', stream);
      }
    }
  }

  _onObjectStream = (msg, ack) => {
    log.debug(`_onObjectStream`, msg);

    if (typeof ack === 'function') {
      ack();
    }

    invariant(this.objects);

    if (!msg || !(`objects` in msg) || !Array.isArray(msg.objects)) {
      log.warn(`Bad objects`, msg);
      return;
    }

    this.objects.push(msg.objects);
    this.emit('objects', msg.objects);
  };
}

class Cameras extends EventEmitter {

  status = 'Initializing...';
  socket = null;

  _webrtcConnections = new Map();
  cameras = {}; // indexed by device id
  _allDevices = []; // unmodified result from Api.account.listDevices()
  _liveDevices = {}; // indexed by device id

  _deviceListUpdateTimer: number = null;

  async _webrtcDisconnect(deviceId) {
    const devicePeer = this._webrtcConnections.get(deviceId);
    if (devicePeer) {
      devicePeer.disconnect();
      this._webrtcConnections.delete(deviceId);
    }

    if (this.cameras[deviceId]) {
      this.cameras[deviceId].setPeer(null);
    }
  }

  // Connect to given deviceId.
  _webrtcConnect(deviceId) {
    // TODO: We should not rely on socket.io in the future to detect
    // connected devices but for now this is very convenient.
    const devicePeer = call(Api, deviceId);
    // XXX: This may fail and should be retired.
    devicePeer.connect();
    // XXX: Also sorta hacky... Indicate to the device to start sending video.
    devicePeer.createChannel('video', {});

    this._webrtcConnections.set(deviceId, devicePeer);
    if (this.cameras[deviceId]) {
      this.cameras[deviceId].setPeer(devicePeer);
    }
  }

  async _updateDeviceList() {
    if (this._deviceListUpdateTimer) {
      clearTimeout(this._deviceListUpdateTimer);
      this._deviceListUpdateTimer = null;
    }

    try {
      const result = await Api.account.listDevices();
      this._allDevices = result.devices;
      this._update();
    } finally {
      // Update the list of devices every minute
      this._deviceListUpdateTimer = setTimeout(async () => {
        this._deviceListUpdateTimer = null;
        try {
          await this._updateDeviceList();
        } catch (e) {
          console.log(e.stack || e);
        }
      }, 60 * 1000);
    }
  }

  async connect() {
    this.status = 'Connecting...';

    try {
      this._updateStatus('Fetching device list...');
      invariant(this._deviceListUpdateTimer === null);
      await this._updateDeviceList();

      this.socket = Api.socketioClient(io, 'account');
      this.socket.open();

      this.socket.on('connect', () => {
        log.info(`Connected to server`);
        this.socket.emit('join', 'video-streams');
        this._updateDeviceList();
      });

      this.socket.on('disconnect', e => {
        log.warn(`Disconnected from server: ${e}`);
        this._liveDevices = {};
        this._updateDeviceList();
      });

      this.socket.on('video-stream-new', (msg) => {
        log.info(`Device online: ${msg.id} ` +
                 `previewSize:${JSON.stringify(msg.previewSize)}` +
                 `objectsSize:${JSON.stringify(msg.objectsSize)}`);
        this._liveDevices[msg.id] = {
          logo: msg.logo,
          previewSize: msg.previewSize,
          objectsSize: msg.objectsSize,
        };
        this._update();
        this._webrtcConnect(msg.id);
      });

      this.socket.on('video-stream-delete', msg => {
        log.info(`Device offline: ${msg.id}`);
        delete this._liveDevices[msg.id];
        this._update();
        this._webrtcDisconnect(msg.id);
      });
    } catch (err) {
      log.error(err);
      this._updateStatus(`Initialization failed: ${err}`);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
    this.socket = null;
    if (this._deviceListUpdateTimer) {
      clearTimeout(this._deviceListUpdateTimer);
      this._deviceListUpdateTimer = null;
    }
    this._updateStatus('Disconnected');
  }

  async unregister(deviceId) {
    const device = this._allDevices.find(device => device.deviceId === deviceId);
    if (!device) {
      log.error('Unable to find device:', deviceId);
      return;
    }
    const devicePublicKey = device.publicKey;
    try {
      const result = await Api.account.unregisterDevice({devicePublicKey});
      if (result.success !== true) {
        log.error('Unable to unregisterDevice:', result);
      }
      await this._updateDeviceList();
    } catch (err) {
      log.error(err);
    }
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
        newDevices[id].setOffline(new Date(device.lastSeenAt));
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
    console.log('~~~ EMIT STATE CHANGE ~~~');
    this.status = status;
    this.emit('stateChanged', this);
  }
}

let cameras = new Cameras();
export default cameras;
