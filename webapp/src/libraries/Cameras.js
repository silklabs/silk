
import config from 'silk-config';
import { EventEmitter } from 'events';
import invariant from 'assert';
import createLog from 'silk-log';
import { call } from 'silk-rtc';
import type { StructuredDataChannel } from 'silk-rtc';

import Api from './Api';
import ObjectCollector from './ObjectCollector';

const log = createLog('Cameras');

type CameraState = 'offline' | 'connecting' | 'unauthorized' | 'online';

const mediaStreamConstraints = {
  preview: {
    video: {
      mandatory: [
        {maxWidth: 640},
        {maxFrameRate: 1},
      ],
    },
    audio: false,
  },
  video: {
    video: {
      mandatory: [
        {minFrameRate: 10},
      ],
    },
    audio: true,
  },
};

// The amount of time to collect objects before sending in a batch.
// (TODO: should match the same const in timeline.js...)
const OBJECT_SEND_INTERVAL_MS = 250;

class Camera extends EventEmitter {
  id = '';
  logoImage = null;
  logs = {};
  name = '';
  objects = null;
  state: CameraState = 'offline';
  previewSize = {
    width: 320,
    height: 180,
  };
  lastSeenAt: Date;
  publicKey: string;
  _retryConnectTimeout = null;

  _requestedRooms = {};
  _logging: boolean = false;
  _diagChannel: ?StructuredDataChannel = null;
  _micChannel: ?StructuredDataChannel = null;
  _videoChannel: ?StructuredDataChannel = null;
  _objectsChannel: ?StructuredDataChannel = null;
  _peer = null;

  _mediaStreamEnabled = {
    preview: {
      enabled: false,
      active: false,
    },
    video: {
      enabled: false,
      active: false,
    },
  }

  constructor(device /*: ListDevicesOutputDevices*/) {
    super();
    Object.assign(this, {
      name: device.name,
      id: device.deviceId,
      publicKey: device.publicKey,
      lastSeenAt: new Date(device.lastSeenAt),
    });
    this._connect();
  }

  _connect() {
    invariant(this._peer === null);

    this.state = 'connecting';
    this._updateStreams();

    const devicePeer = call(Api, this.id);

    devicePeer.connect()
    .catch(err => {
      log.warn(`Peer connect failed for ${this.id}`);
      this._onPeerClose();
      if (err.message === 'UNAUTHORIZED') {
        this.state = 'unauthorized';
        this._updateStreams();
      }
    });
    devicePeer.on('connect', this._onPeerConnect);
    devicePeer.on('close', this._onPeerClose);
    devicePeer.on('addstream', this._updateStreams);
    devicePeer.on('removestream', this._updateStreams);

    this._peer = devicePeer;
    this.emit('peer', this._peer);
  }

  deinit() {
    if (this._peer) {
      this._peer.destroy();
      this._onPeerClose();
    }
    if (this._retryConnectTimeout !== null) {
      clearTimeout(this._retryConnectTimeout);
      this._retryConnectTimeout = null;
    }
    this.state = 'offline';
    this._updateStreams();
  }

  getPeer() {
    return this._peer;
  }

  _onPeerConnect = () => {
    log.info(`Peer connected, updating webrtc status for ${this.id}`);
    this.state = 'online';
    this._updateStreams();
  }

  _onPeerClose = () => {
    this._peer = null;
    this.state = 'offline';
    log.info(`Peer closed, updating webrtc status for ${this.id}`);
    this._updateStreams();

    // Try calling the device again soon
    if (this._retryConnectTimeout === null) {
      this._retryConnectTimeout = setTimeout(
        () => {
          this._retryConnectTimeout = null;
          this._connect();
        },
        10 * 1000
      );
    }
  }

  set logging(enabled) {
    this._logging = enabled;
    this._updateDiagStream();
  }

  _updateStreams = () => {
    this._updateMediaStreams();
    this._updateDiagStream();
    this._updateVideoClipStream();
    this._updateMicStream();
    this.emit('stateChanged');
  };

  get online(): boolean {
    return this.state === 'online';
  }

  get diagOnline(): boolean {
    return this._diagChannel && this._diagChannel.open;
  }

  get mediaStreams() {
    if (this._peer === null) {
      return new Map();
    }
    return this._peer.getMediaStreams();
  }

  _updateMediaStreams() {
    let requestObjects = false;
    for (let label of Object.keys(this._mediaStreamEnabled)) {
      const state = this._mediaStreamEnabled[label];
      log.info(label, state);
      if (state.enabled) {
        requestObjects = true;
        if (!state.active) {
          if (this.online) {
            state.active = true;
            this._peer.requestRemoteMediaStream(label, mediaStreamConstraints[label])
            .catch((err) => {
              log.error(`Failed to request stream for ${this.id}: ${err.stack}`);
              state.active = false;
            });
          }
        }
      } else {
        if (state.active) {
          state.active = false;
          if (this._peer !== null) {
            this._peer.removeStream(label);
          }
        }
      }
    }

    this._updateObjectStream(requestObjects);
  }

  setMediaStream(label, enabled: boolean) {
    invariant(typeof mediaStreamConstraints[label] === 'object', `Invalid ${label}`);
    invariant(typeof this._mediaStreamEnabled[label] === 'object', `Invalid ${label}`);
    this._mediaStreamEnabled[label].enabled = enabled;
    this._updateMediaStreams();
  }

  _updateDiagStream() {
    const enabled = this._logging;
    if (enabled && this.state === 'online') {
      if (this._peer !== null && this._diagChannel === null) {
        log.info('Creating diag channel');
        this._diagChannel = this._peer.createChannel(
          'diag',
          {
            maxRetransmitTime: 1000,
          }
        );
        this._diagChannel.on('open', () => {
          log.debug('Diag channel open');
          this._diagChannel.emit('hello', {});
        });
        this._diagChannel.on('close', () => {
          log.info('Diag channel closed');
        });
        this._diagChannel.on('error', this._onChannelError);
        this._diagChannel.on('logchunk', this._onDiagLogChunk);
        this._diagChannel.on('timeline:state', (data) => {
          this.emit('diagState:timeline', data);
        });
        this._diagChannel.on('timeline:jpegFrame', (data) => {
          this.emit('diagJpegFrames', [data]);
        });
        this._diagChannel.on('cameraClipRecorder:state', (data) => {
          this.emit('diagState:camera', data);
        });
      }
    } else {
      if (this._diagChannel) {
        log.info('Closing diag channel');
        this._diagChannel.close();
        this._diagChannel = null;
      }
    }
  }

  _onChannelError = (err) => {
    log.error('Got channel error:', err.stack || err);
  };

  _onDiagLogChunk = msg => {
    switch (msg.type) {
    case 'log':
      switch (msg.name) {
      case 'dash':
        this.logs.dash = msg.log;
        break;
      case 'logcat':
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
    if (!this._diagChannel) {
      log.warn('Diag not online, unable to reboot');
      return;
    }
    this._diagChannel.emit('reboot', {channel});
  }

  diagTimelineCommand(name: string, arg: string = '') {
    this._diagChannel.emit('timeline:cmd', {name, arg});
  }

  diagCameraCommand(name: string, arg: string = '') {
    this._diagChannel.emit('cameraClipRecorder:cmd', {name, arg});
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
    switch (event) {
    case 'videoClip':
    case 'micData':
      {
        const count = super.listeners(event).length;
        const enabled = count > 0;

        this._requestedRooms[event] = enabled;

        this._updateVideoClipStream();
        this._updateMicStream();
        break;
      }
    default:
      log.debug(`_adjustRooms: unhandled event: ${event}`);
      break;
    }
  }

  _updateVideoClipStream() {
    const enabled = this._requestedRooms.videoClip;
    if (enabled && this.state === 'online') {
      if (this._peer !== null && this._videoChannel === null) {
        log.info('Creating video channel');
        this._videoChannel = this._peer.createChannel(
          'video',
          {
            maxRetransmitTime: 1000,
          }
        );
        this._videoChannel.on('open', () => {
          log.debug('Video channel open');
        });
        this._videoChannel.on('close', () => {
          log.debug('Video channel close');
        });
        this._videoChannel.on('error', this._onChannelError);
        this._videoChannel.on('mp4', this._onVideoStream);
      }
    } else {
      if (this._videoChannel) {
        log.info('Closing video channel');
        this._videoChannel.close();
        this._videoChannel = null;
      }
    }
  }

  _onVideoStream = (msg) => {
    if (!msg) {
      log.warn('_onVideoStream: null msg');
      return;
    }
    if (!msg.frame) {
      log.warn('_onVideoStream: null msg.frame');
      return;
    }
    log.debug(`Received video message networkLag=${Date.now() - msg.deviceEmitMs}`);
    this.emit('videoClip', msg.frame, msg.when);
  };

  _updateMicStream() {
    const enabled = this._requestedRooms.micData;
    if (enabled && this.state === 'online') {
      if (this._peer !== null && this._micChannel === null) {
        this._micChannel = this._peer.createChannel('mic',
          {
            maxRetransmitTime: 1000,
          }
        );
        this._micChannel.on('open', () => {
          log.debug('Mic channel open');
        });
        this._micChannel.on('close', () => {
          log.debug('Mic channel close');
        });
        this._micChannel.on('error', this._onChannelError);
        this._micChannel.on('pcm', this._onMicStream);
      }
    } else {
      if (this._micChannel) {
        this._micChannel.close();
        this._micChannel = null;
      }
    }
  }

  _onMicStream = (msg) => {
    if (!msg) {
      log.warn('_onMicStream: null msg');
      return;
    }
    if (config.deviceMic.bytesPerSample === 2
        && config.deviceMic.encoding === 'signed-integer'
        && config.deviceMic.endian === 'little') {
      const reader = new FileReader();
      reader.readAsArrayBuffer(msg.samples);
      reader.onloadend = () => {
        msg.samples = new Int16Array(reader.result);
        this.emit('micData', msg);
      };
    } else {
      throw new Error(`Unhandled deviceMic configuration: ${config.deviceMic}`);
    }
  };

  _updateObjectStream(enabled) {
    if (enabled && this.state === 'online') {
      if (this._peer !== null && this._objectsChannel === null) {
        this.objects = new ObjectCollector();
        this._objectsChannel = this._peer.createChannel(
          'objects',
          {
            maxRetransmitTime: OBJECT_SEND_INTERVAL_MS * 2,
          }
        );
        this._objectsChannel.on('open', () => {
          log.debug('Objects channel open');
        });
        this._objectsChannel.on('close', () => {
          log.debug('Objects channel close');
        });
        this._objectsChannel.on('error', this._onChannelError);
        this._objectsChannel.on('objects', this._onObjectStream);
      }
    } else {
      if (this._objectsChannel) {
        this._objectsChannel.close();
        this._objectsChannel = null;
        this.objects = null;
      }
    }
  }

  _onObjectStream = (msg) => {
    log.debug(`_onObjectStream`, msg);
    if (!msg || !(`objects` in msg) || !(`now` in msg) || !Array.isArray(msg.objects)) {
      log.warn(`Bad objects`, msg);
      return;
    }

    const maxsize = msg.maxsize;
    if (!(maxsize && maxsize.width && maxsize.height)) {
      log.warn(`Bad object maxsize`, msg);
      return;
    }

    if (!this.objects) {
      log.warn('No ObjectCollector, ignoring new objects');
      return;
    }

    const lastNow = this.objects.deviceTime;
    if (lastNow > 0) {
      const objectDelay = msg.now - lastNow;
      if (objectDelay > OBJECT_SEND_INTERVAL_MS * 1.5) {
        log.warn(`Objects delayed by ${objectDelay - OBJECT_SEND_INTERVAL_MS}ms`);
      }
    }
    this.objectsSize = maxsize; // TODO: This is terrible
    this.objects.push(msg.now, msg.objects, maxsize.width, maxsize.height);
  };
}

class Cameras extends EventEmitter {

  status = 'Initializing...';

  cameras = {}; // indexed by device id
  _deviceListUpdateTimer: number = null;

  get(deviceId: string): Camera {
    return this.cameras[deviceId];
  }

  async _updateDeviceList() {
    if (this._deviceListUpdateTimer) {
      clearTimeout(this._deviceListUpdateTimer);
      this._deviceListUpdateTimer = null;
    }

    try {
      const result = await Api.account.listDevices();
      const allDevices = result.devices;

      let oldDevices = this.cameras;
      let newDevices = {};

      for (const device of allDevices) {
        const id = device.deviceId;
        if (newDevices[id]) {
          throw new Error(`Duplicate device: ${id}`);
        }

        if (oldDevices[id]) {
          newDevices[id] = oldDevices[id];
          delete oldDevices[id];
        } else {
          newDevices[id] = new Camera(device);
        }
      }

      // Cleanup any devices that no longer exist
      Object.keys(oldDevices).map(id => oldDevices[id].deinit());

      this.cameras = newDevices;

      let status = `${allDevices.length} registered devices`;

      // Avoid listener leak runtime warning with > 10 devices
      this.setMaxListeners(allDevices.length * 2);
      this._updateStatus(status);
    } catch (err) {
      log.error(err);
      this._updateStatus(`Initialization failed: ${err}`);
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
    this._updateStatus('Fetching device list...');
    invariant(this._deviceListUpdateTimer === null);
    this._updateDeviceList();
  }

  disconnect() {
    for (let camera in this.cameras) {
      this.cameras[camera].deinit();
    }
    this.cameras = {};

    if (this._deviceListUpdateTimer) {
      clearTimeout(this._deviceListUpdateTimer);
      this._deviceListUpdateTimer = null;
    }
    this._updateStatus('Disconnected');
  }

  async unregister(deviceId) {
    const device = this.cameras[deviceId];
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
      log.error(err.stack);
    }
  }


  _updateStatus(status) {
    this.status = status;
    this.emit('stateChanged', this);
  }
}

let cameras = new Cameras();
export default cameras;
