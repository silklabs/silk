/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

import * as VideoMetrics from './metrics/video';
import * as util from './sysutils';
import CBuffer from 'CBuffer';
import CameraRestart from './metrics/camera_restart';
import config from 'silk-config';
import api from './api';
import createLog from './log';
import cv from 'opencv';
import silkcv from 'silk-cv';
import fs from 'mz/fs';
import invariant from 'assert';
import mkdirp from 'mkdirp-promise';
import net from 'net';
import path from 'path';
import type Server from './server.js';
import wrapNoEntity from './fs/wrap_no_entity';
import { EventEmitter } from 'events';

/**
 * Type representing an object rectangle
 * (TODO: De-dup with timeline.js)
 *
 * @property {number} x x co-ordinate of the object rectangle
 * @property {number} y y co-ordinate of the object rectangle
 * @property {number} width width of the object rectangle
 * @property {number} height height of the object rectangle
 */
type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Type representing the camera frame callback
 *
 * @property {boolean} err True if the frame is retrieved succesfully, false
 *                         otherwise
 * @property {object} image Requested preivew image as per the specified
 *                          CameraFrameFormat format
 */
export type CameraCallback = (err: boolean, image: any) => void;

/**
 * The available camera frame formats:
 * fullgray - full resolution grayscale   (CameraFrameSize === 'full')
 * fullrgb  - full resolution rgb         (CameraFrameSize === 'full')
 * highgray - higher res grayscale        (CameraFrameSize === 'high')
 * gray     - normal grayscale            (CameraFrameSize === 'normal')
 * grayeq   - normal grayscale equalized  (CameraFrameSize === 'normal')
 * rgb      - normal rgb                  (CameraFrameSize === 'normal')
 * lowgray  - lower res grayscale         (CameraFrameSize === 'low')
 */
export type CameraFrameFormat = 'fullgray' | 'fullrgb' | 'highgray' | 'gray' | 'grayeq' | 'rgb' | 'lowgray';

/**
 * The available camera frame sizes:
 * full - full resolution frame
 * high - higher resolution frame for image analysis
 * normal - normal frame size for image analysis
 * low - lower resolution frame for image analysis
 */
export type CameraFrameSize = 'low' | 'normal' | 'high' | 'full';

type RawHalFace = {
  rect: [number, number, number, number];
  score: number;
  id: number;
  leftEye: [number, number];
  rightEye: [number, number];
  mouth: [number, number];
};

//const FRONT = 1;
//const BACK = 0;

const log = createLog('camera');

const DURATION_PROP = 'persist.silk.video.duration';

// Clamp duration between 100ms and 10s. Any longer and the object metadata
// associated with a video clip could easily get too large for the server to
// handle (silk-device#1054). Defaults to 1s.
const DURATION_MS =
  Math.max(100, Math.min(util.getintprop(DURATION_PROP, 1000), 10000));

const WIDTH = util.getintprop('ro.silk.camera.width', 1280);
const HEIGHT = util.getintprop('ro.silk.camera.height', 720);
const FPS = util.getintprop('ro.silk.camera.fps', 24);
const VBR = util.getintprop('ro.silk.camera.vbr', 1024);

const FRAME_SCALE_LOW = util.getintprop('ro.silk.camera.scale.low', 5);
const FRAME_SCALE_DEFAULT = util.getintprop('ro.silk.camera.scale', 4);
const FRAME_SCALE_HIGH = util.getintprop('ro.silk.camera.scale.high', 2);

const FRAME_SIZE = {
  low: {
    width: Math.round(WIDTH / FRAME_SCALE_LOW),
    height: Math.round(HEIGHT / FRAME_SCALE_LOW),
  },
  normal: {
    width: Math.round(WIDTH / FRAME_SCALE_DEFAULT),
    height: Math.round(HEIGHT / FRAME_SCALE_DEFAULT),
  },
  high: {
    width: Math.round(WIDTH / FRAME_SCALE_HIGH),
    height: Math.round(HEIGHT / FRAME_SCALE_HIGH),
  },
  full: {
    width: WIDTH,
    height: HEIGHT,
  },
};

// Rate that new camera frames are proceeded.  Ideally this would equal
// 1000/FPS however is usually longer due to limited compute
const FRAME_DELAY_MS = 250; // 4 FPS

const MAX_CLIP_DURATION = Math.max(1, util.getintprop('ro.silk.camera.max_clip_dur', 15 /*seconds*/));
const CAMERA_CLIP_DIRECTORY = 'data/clips';

const FLASH_LIGHT_PROP = 'persist.silk.flash.enabled';
const FLASH_LIGHT_ENABLED = util.getboolprop(FLASH_LIGHT_PROP);

const AUDIO_MUTE_PROP = 'persist.silk.capture.mute';
let audioMute = util.getboolprop(AUDIO_MUTE_PROP, true);

const AUDIO_HW_ENABLED = util.getboolprop('ro.silk.audio.hw.enabled', true);

//
// Constants
//
const CAPTURE_CTL_SOCKET_NAME = '/dev/socket/capturectl';
const CAPTURE_DATA_SOCKET_NAME = '/dev/socket/captured';


// When trying to reestablish contact with the capture process first delay by
// this amount to permit:
// * multiple restart commands to collect - each of the capture socket
// disconnects can cause an independent restart request.
// * the capture process a little bit of time to recover itself if it
// just crashed before attempting to reestablish contact.
const CAPTURE_RESTART_DELAY_MS = 1000;

// Amount of time to give the capture process to initialize before declaring
// the attempt as failed and triggering a retry
const CAPTURE_INIT_TIMEOUT_MS = 10 * 1000;

// If TAG_VIDEO or TAG_MIC is not received in this amount of time assume the
// capture process is wedged and restart it.
const CAPTURE_TAG_TIMEOUT_MS = 10 * 1000;

// If there is still not a camera frame after this number of attempts assume the
// capture process is wedged and restart it.
const CAPTURE_PREVIEW_GRAB_MAX_ATTEMPTS = 5 * (1000 / FRAME_DELAY_MS);

// These constants must match those in Channel.h
const HEADER_NR_BYTES = 20; // sizeof(Channel::Header)
const TAG_VIDEO = 0;
const TAG_FACES = 1;
const TAG_MIC = 2;

const NUM_IMAGES_TO_CACHE = 10;

/**
 * Flash modes as defined in <camera/CameraParameters.cpp>
 * @memberof CameraStream
 */
let FLASH_MODE = {
  OFF: 'off',
  AUTO: 'auto',
  ON: 'on',
  RED_EYE: 'red-eye',
  TORCH: 'torch',
};

/**
 * Return the raw Buffer of bytes `buf` parsed into array of face
 * objects with fields named after `camera_face_t` in
 * system/core/include/system/camera.h.
 * @private
 */
function rawFaceArrayToFaces(buf): Array<RawHalFace> {
  const SIZEOF_CAMERA_FACE_T = 12 * 4;
  if (buf.length % SIZEOF_CAMERA_FACE_T) {
    throw `Raw face array has invalid length ${buf.length}`;
  }
  let nrFaces = buf.length / SIZEOF_CAMERA_FACE_T;
  let i32a = new Int32Array(new Uint8Array(buf).buffer);
  let faces = [ ];
  let faceIndex;
  let a = offset => i32a[faceIndex + offset];
  for (let i = 0; i < nrFaces; ++i) {
    let face = { };
    faceIndex = i * (SIZEOF_CAMERA_FACE_T / 4);
    face.rect = [ a(0), a(1), a(2), a(3) ];
    face.score = a(4);
    face.id = a(5);
    face.leftEye = [ a(6), a(7) ];
    face.rightEye = [ a(8), a(9) ];
    face.mouth = [ a(10), a(11) ];
    faces.push(face);
  }
  return faces;
}

/**
 * Set the fields `{ x, y, width, height }` in `face` representing the
 * `face.rect` rectangle mapped into mako screen space IN THE
 * ORIENTATION WHERE FRONT CAMERA IS BOTTOM RIGHT FACING YOU.
 * @private
 */
function normalizeFace(face) { //eslint-disable-line no-unused-vars

  // These params are defined by the long comment just below the
  // declaration of `struct camera_face` in
  // system/core/include/system/camera.h.
  let [left, top, right, bottom ] = face.rect;
  const TARGET_ORIENTATION = 'landscape';
  // Transform the rectangle to what upstream consumers expect.
  switch (TARGET_ORIENTATION) {
  case 'profile':
    // Rotate-left transform, which works out to
    [ left, top, right, bottom ] = [ top, -right, bottom, -left ];
    break;
  default:
    break;
  }
  // And finally, we transform the abstract "face space" coords into
  // mako device-pixel space with top-left as (0,0)
  let normLen = (l, len) => (len * l / 2000.0) | 0;
  let normCoord = (c, len) => normLen(c + 1000.0, len);

  // Intentionally discard additional HAL face data such as the
  // mouth/score as they are never used downstream.
  const DEFAULT_FRAME_WIDTH = FRAME_SIZE.default.width;
  const DEFAULT_FRAME_HEIGHT = FRAME_SIZE.default.height;
  return {
    x: normCoord(left, DEFAULT_FRAME_WIDTH),
    y: normCoord(top, DEFAULT_FRAME_HEIGHT),
    width: normLen(right - left, DEFAULT_FRAME_WIDTH),
    height: normLen(bottom - top, DEFAULT_FRAME_HEIGHT),
    leftEye: [normCoord(face.leftEye[0], DEFAULT_FRAME_WIDTH),
        normCoord(face.leftEye[1], DEFAULT_FRAME_HEIGHT)],
    rightEye: [normCoord(face.rightEye[0], DEFAULT_FRAME_WIDTH),
        normCoord(face.rightEye[1], DEFAULT_FRAME_HEIGHT)],
    id: face.id,
  };
}


/**
 * Current state of the CameraClipRecorder.
 * live - normal camera mode
 * record - actively recording frames into the circular buffer
 * pause - paused in playback mode
 * play - playback mode active
 * busy - currently loading or saving a clip
 */
type CameraClipRecorderMode = 'live' | 'record' | 'pause' | 'play' | 'busy';

/**
 * CameraClipRecorder state
 *
 * This entire type is shared with the web app, so if you change it then
 * update webapp/src/components/Diag.js too
 */
type CameraClipRecorderState = {
  mode: CameraClipRecorderMode;
  availableClips: Array<string>; // List of available clips to load
  msg: string; // Something to display to the diag user (eg, result of last op)
  repeat: bool; // True if the replay should repeat once at the end
};

type CameraClipFrameImages = [
  number, // when
  any,   // Full rgb matrix for this camera frame
  any,   // Full grayscale matrix for this camera frame
  any,   // Scaled grayscale matrix for this camera frame
];
function CameraClipFrameImagesRelease(item: CameraClipFrameImages): void {
  item[1].release();
  item[2].release();
  item[3].release();
}

/**
 * Represents the "clip recorder", which enables the recording and replay of
 * camera video streams
 */
class CameraClipRecorder {
  state: CameraClipRecorderState;

  _frames: CBuffer<CameraClipFrameImages>;
  _framePosition: number;
  _onStateChange: Function;

  constructor(onStateChange: Function) {
    this._onStateChange = onStateChange;
    this._framePosition = 0;
    this._frames = new CBuffer(MAX_CLIP_DURATION * 1000 / FRAME_DELAY_MS);
    this._frames.overflow = CameraClipFrameImagesRelease;

    this.state = {
      mode: 'live',
      availableClips: [],
      msg: '',
      repeat: false,
    };
    this.reset();
    this._loadAvailableClips();
  }

  async _loadAvailableClips(): void {
    this.state.availableClips = [];
    const files = await wrapNoEntity(fs.readdir(CAMERA_CLIP_DIRECTORY), []);
    for (const file of files) {
      const ext = path.extname(file);
      if (ext === '.json') {
        this.state.availableClips.push(path.basename(file, ext));
      }
    }
    if (this.state.availableClips.length > 0) {
      log.info('Loaded clips:', this.state.availableClips);
      this._onStateChange();
    }
  }

  _loadImage(file: string): Promise<any> {
    return new Promise((resolve, reject) => {
      cv.readImage(file, (err, im) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(im);
      });
    });
  }

  /*
   * Loads a clip
   */
  async load(name: string): void {
    const clipMetadataFile = path.join(CAMERA_CLIP_DIRECTORY, name + '.json');
    if (!await fs.exists(clipMetadataFile)) {
      log.warn('Clip metadata does not exist:', clipMetadataFile);
      return;
    }

    this.state.msg = `Loading ${name}...`;
    this.state.mode = 'busy';
    this._onStateChange();

    const metadata = JSON.parse(await fs.readFile(clipMetadataFile, 'utf8'));
    const frames = metadata.frames;
    this._frames.empty();
    this._framePosition = 0;

    await frames.forEach(async (when) => {
      let imageFile = path.join(CAMERA_CLIP_DIRECTORY, 'img', `${when}.png`);
      if (!await fs.exists(imageFile)) {
        log.warn('Clip image does not exist:', imageFile);
        return;
      }
      log.verbose('Loading', imageFile);
      const imRGB = await this._loadImage(imageFile);

      let imGray = imRGB.copy();
      imGray.cvtColor('CV_BGR2GRAY');

      let imScaledGray = imGray.copy();
      imScaledGray.resize(FRAME_SIZE.normal.width, FRAME_SIZE.normal.height);

      this._frames.push([when, imRGB, imGray, imScaledGray]);
    });
    this.state.msg = `Loaded ${CAMERA_CLIP_DIRECTORY}/${name}`;
    this.state.mode = 'pause';
    this._onStateChange();
  }

  /*
   * Saves the current clip
   */
  async save(name: string): void {
    if (this.state.mode !== 'pause' && this.state.mode !== 'play') {
      this._onStateChange();
      return;
    }

    this.state.msg = `Saving ${name}...`;
    this.state.mode = 'busy';
    this._onStateChange();
    const frames = this._frames.toArray();
    let metadata = {
      frames: frames.map(item => item[0]),
    };

    await mkdirp(path.join(CAMERA_CLIP_DIRECTORY, 'img'));
    const clipMetadataFile = path.join(CAMERA_CLIP_DIRECTORY, name + '.json');
    await fs.writeFile(clipMetadataFile, JSON.stringify(metadata, null, '  '));

    await frames.forEach(async (item) => {
      let [when, imRGB] = item;

      let imageFile = path.join(CAMERA_CLIP_DIRECTORY, 'img', `${when}.png`);
      if (!await fs.exists(imageFile)) {
        log.verbose('Saving', imageFile);
        imRGB.save(imageFile);
      }
    });
    this.state.msg = `Saved ${CAMERA_CLIP_DIRECTORY}/${name}`;
    this.state.mode = 'pause';
    this.state.availableClips.push(name);
    this._onStateChange();
  }

  /*
   * Reset to the default/live state
   */
  reset(): void {
    this.resumeLive();
  }

  maybeReplaceFrame(when: number, imRGB: any, imGray: any, imScaledGray: any): CameraClipFrameImages {
    switch (this.state.mode) {
    case 'record':
      this._frames.push([
        when,
        imRGB.copy(),
        imGray.copy(),
        imScaledGray.copy(),
      ]);
      // fall through
    case 'live':
      return [when, imRGB, imGray, imScaledGray];
    default:
      if (this._framePosition >= this._frames.size) {
        log.error('Invalid _framePosition.',
          `${this._framePosition} >= ${this._frames.size}`);
        this.stopPlayback();
        return [when, imRGB, imGray, imScaledGray];
      }

      const frame = this._frames.get(this._framePosition);

      let nextFramePosition = this._framePosition;
      if (this.state.mode === 'play') {
        nextFramePosition++;
        if (nextFramePosition >= this._frames.size) {
          if (this.state.repeat) {
            nextFramePosition = 0;
          } else {
            nextFramePosition = this._frames.size - 1;
            this.stopPlayback();
          }
        }
      }
      this._framePosition = nextFramePosition;

      imRGB.release();
      imGray.release();
      imScaledGray.release();

      [when, imRGB, imGray, imScaledGray] = frame;
      return [when, imRGB.copy(), imGray.copy(), imScaledGray.copy()];
    }
  }

  resumeLive(): void {
    if (this.state.mode !== 'busy') {
      this.state.mode = 'live';
      this.state.msg = '';
      this._frames.empty();
    }
    this._onStateChange();
  }

  startRecording(): void {
    if (this.state.mode === 'live') {
      this.state.mode = 'record';
      this.state.msg = 'Recording';
    }
    this._onStateChange();
  }

  stopRecording(): void {
    if (this.state.mode === 'record') {
      this.state.mode = 'pause';
      this.seek(-Infinity);
    } else {
      this._onStateChange();
    }
  }


  startPlayback(): void {
    if (this.state.mode === 'pause') {
      this.state.mode = 'play';
      this.state.msg = 'Playing';
    }
    this._onStateChange();
  }

  stopPlayback(): void {
    if (this.state.mode === 'play') {
      this.state.mode = 'pause';
      this.seek(0);
    } else {
      this._onStateChange();
    }
  }

  setRepeat(enabled: bool): void {
    this.state.repeat = enabled;
    this._onStateChange();
  }

  _clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(v, min));
  }

  seek(distance: number): void {
    if (this.state.mode === 'pause' || this.state.mode === 'play') {
      this._framePosition = this._clamp(this._framePosition + distance,
        0, Math.max(0, this._frames.size - 1));
      this.state.msg = `Seek to ${this._framePosition}`;
    }
    this._onStateChange();
  }

  trimBefore(): void {
    if (this.state.mode === 'pause') {
      for (let i = 0; i < this._framePosition; i++) {
        this._frames.shift();
      }
      this.state.msg = `Trimmed before ${this._framePosition}`;
      this._framePosition = 0;
    }
    this._onStateChange();
  }

  trimAfter(): void {
    if (this.state.mode === 'pause') {
      while (this._frames.size > this._framePosition + 1) {
        this._frames.pop();
      }
      this.state.msg = `Trimmed after ${this._framePosition}`;
      this._framePosition = this._frames.size - 1;
    }
    this._onStateChange();
  }
}


/**
 * Class that talks to capture service to receive camera frames
 * @param {Timeline} timeline instance of Timeline class
 */
export default class Camera extends EventEmitter {
  _clipRecorder: CameraClipRecorder;
  server: Server;
  _liveDiag: bool;

  constructor(server, timeline) {
    super();
    invariant(server, 'must pass server...');
    invariant(timeline, 'must pass timeline...');
    this.server = server;
    this.timeline = timeline;

    this._ready = false;
    this._recording = false;
    this._cvVideoCapture = null;
    this._cvVideoCaptureBusy = false;
    this._ctlSocket = null;
    this._dataSocket = null;
    this._frameQueue = []; // Queue of pending camera frame requests
    this._motion = true;

    this._liveDiag = false;
    this._clipRecorder = new CameraClipRecorder(this._diagEmitState);

    // Cache last few images to guarantee the consumers get the image they are
    // expecting and not the latest camera frame. Also helps prevent resizing a
    // frame multiple times.
    this._imagecache = new CBuffer(NUM_IMAGES_TO_CACHE);
    this._imagecache.overflow = (item) => this._releaseImageCacheEntry(item);

    this.timeline.on('no-motion', () => {
      this._motion = false;
    });

    this.timeline.on('motion', () => {
      this._motion = true;
    });

    // TODO Remove watch when this setting gets moved to the UI
    util.propWatcher.on(AUDIO_MUTE_PROP, () => {
      audioMute = util.getboolprop(AUDIO_MUTE_PROP, true);
      this.setMute(audioMute);
    });

    // Helpful debug output...
    log.verbose('Active frame sizes:');
    for (let frameSize in FRAME_SIZE) {
      log.verbose(`  ${frameSize}: ${JSON.stringify(FRAME_SIZE[frameSize])}`);
    }
  }

  /**
   * Releases cached images
   * @private
   */
  _releaseImageCacheEntry(item) {
    for (let key in item) {
      if (!item.hasOwnProperty(key)) {
        continue;
      }
      switch (key) {
      case 'when':
        break;
      default:
        // Release node-opencv Matrix objects immediately rather than
        // waiting for the GC to claim them.
        if (item[key]) {
          item[key].release();
        }
      }
    }
  }

  /**
   * Restarts communication with the capture process.
   *
   * In certain error conditions, it can also be beneficial to restart the
   * capture process (such as when it is not providing the expected video data)
   * an attempt to recover the system.
   * @private
   */
  _restart(why, restartCaptureProcess = false) {
    if (this._restartTimeout) {
      log.info(`camera restart pending (ignored "${why}")`);
      return;
    }

    log.warn(`camera restart: ${why} captureRestart=${restartCaptureProcess}`);
    api.metrics.add(new CameraRestart({
      reason: why,
      captureRestart: restartCaptureProcess
    }));
    this._ready = false;

    if (this._initTimeout) {
      clearTimeout(this._initTimeout);
      this._initTimeout = null;
    }

    if (this._frameTimeout) {
      clearTimeout(this._frameTimeout);
      this._frameTimeout = null;
    }
    if (this._tagMonitorTimeout) {
      clearTimeout(this._tagMonitorTimeout);
      this._tagMonitorTimeout = null;
    }
    if (this._cvVideoCapture) {
      this._cvVideoCapture.close();
      this._cvVideoCapture = null;
      this._cvVideoCaptureBusy = false;
    }
    if (this._ctlSocket) {
      this._ctlSocket.destroy();
      this._ctlSocket = null;
    }
    if (this._dataSocket) {
      this._dataSocket.destroy();
      this._dataSocket = null;
    }

    if (restartCaptureProcess) {
      util.setprop('ctl.restart', 'capture');
    }

    this._restartTimeout = setTimeout(() => {
      log.verbose('restart timeout expired, trying to initialize');
      this._restartTimeout = null;
      this._init();
    }, CAPTURE_RESTART_DELAY_MS);
  }

  /**
   * @private
   */
  _initCVVideoCapture() {
    if (!this._cvVideoCapture) {
      try {
        this._cvVideoCapture = new silkcv.VideoCapture(0,
          FRAME_SIZE.normal.width, FRAME_SIZE.normal.height);
      } catch (err) {
        throw err;
      }
    }
  }

  _initFrameCapture() {
    this._scheduleNextFrameCapture();

    clearTimeout(this._initTimeout);
    this._initTimeout = null;

    this._ready = true;
    this.emit('ready');
  }

  _startSimMicCapture() {
    const mic = require('mic');
    let simMic = mic({
      bitwidth: 8 * config.deviceMic.bytesPerSample,
      channels: config.deviceMic.numChannels,
      encoding: config.deviceMic.encoding,
      endian: config.deviceMic.endian,
      rate: config.deviceMic.sampleRate,
    });
    let micInput = simMic.getAudioStream();
    micInput.on('data', (data) => {
      this.emit('mic-data', { when: Date.now(), frames: data });
    });
    micInput.on('error', (error) => {
      // TODO: what should we do on errors ...
      log.error(`Sim mic error: ${error}`);
    });
    simMic.start();
  }

  /**
   * @private
   */
  _init() {
    if (this._ready) {
      log.warn(`camera already initialized`);
      return;
    }
    if (this._initTimeout) {
      log.warn(`camera actively initializing`);
      return;
    }
    this._initTimeout = setTimeout(() => {
      this._initTimeout = null;
      this._restart('failed to initialize in a timely fashion', true);
    }, CAPTURE_INIT_TIMEOUT_MS);

    this._clipRecorder.reset();

    if (process.platform !== 'android') {
      // The capture process is currently gonk only.  For other platforms only initialize
      // OpenCV video capture.
      process.nextTick(() => {
        this._initCVVideoCapture();
        this._initFrameCapture();
        this._startSimMicCapture();
      });
      return;
    }

    // Connecting to data socket
    this._dataBuffer = null;
    log.verbose(`connecting to ${CAPTURE_DATA_SOCKET_NAME} socket`);
    this._dataSocket = net.createConnection(CAPTURE_DATA_SOCKET_NAME, () => {
      log.verbose(`connected to ${CAPTURE_DATA_SOCKET_NAME} socket`);
      this._dataBuffer = null;
    });
    this._dataSocket.on('data', data => this._onDataSocketRead(data));
    this._dataSocket.on('error', err => {
      this._restart(`camera data socket error, reason=${err}`);
    });
    this._dataSocket.on('close', hadError => {
      if (!hadError) {
        this._restart(`camera data socket close`);
      }
    });

    // Connecting to control socket
    log.verbose(`connecting to ${CAPTURE_CTL_SOCKET_NAME} socket`);
    this._ctlSocket = net.createConnection(CAPTURE_CTL_SOCKET_NAME, () => {
      log.verbose(`connected to ${CAPTURE_CTL_SOCKET_NAME} socket`);

      this._initCVVideoCapture();

      this._buffer = '';
      const cmdData = {
        frameIntervalMs: DURATION_MS,
        width: WIDTH,
        height: HEIGHT,
        fps: FPS,
        vbr: VBR,
        audioMute,
        audioSampleRate: config.deviceMic.sampleRate,
        audioChannels: config.deviceMic.numChannels
      };

      this._command({cmdName: 'init', cmdData});
    });
    this._ctlSocket.on('data', data => this._onCtlSocketRead(data));
    this._ctlSocket.on('error', err => {
      this._restart(`camera control socket error, reason=${err}`);
    });
    this._ctlSocket.on('close', hadError => {
      if (!hadError) {
        this._restart(`camera control socket close`);
      }
    });
  }

  /**
   * @private
   */
  _tagMonitor = () => {
    if (this._videoTagReceived && (this._micTagReceived || !AUDIO_HW_ENABLED)) {
      this._videoTagReceived = this._micTagReceived = null;
      this._tagMonitorTimeout = setTimeout(this._tagMonitor, CAPTURE_TAG_TIMEOUT_MS);
      return;
    }
    this._restart(`Expected Tags not received from capture promptly. ` +
                  `video=${this._videoTagReceived}, mic=${this._micTagReceived}`,
                  true);
  };

  /**
   * @private
   */
  _onCtlSocketRead(data) {
    log.verbose(`received ctl data: ${data.toString()}`);
    this._buffer += data.toString();

    let nullByte;
    while ((nullByte = this._buffer.indexOf('\0')) !== -1) {
      let line = this._buffer.substring(0, nullByte);
      this._buffer = this._buffer.substring(nullByte + 1);

      let found;
      if ((found = line.match(/^([\d]*) (.*)/))) {
        line = found[2];
      }

      let captureEvent = JSON.parse(line);
      if (captureEvent.eventName === 'error') {
        log.warn('Camera command errored out'); // Not much to do here really
      } else if (captureEvent.eventName === 'initialized') {
        this._command({cmdName: 'setParameter', name: 'focus-mode', value: 'continuous-video'});
        this._tagMonitorTimeout = setTimeout(this._tagMonitor, CAPTURE_TAG_TIMEOUT_MS);

        this._initFrameCapture();
      } else if (captureEvent.eventName === 'getParameter') {
        if (this._getParameterCallback) {
          this._getParameterCallback.resolve(captureEvent.data);
          this._getParameterCallback = null;
        }
      } else if (captureEvent.eventName === 'stopped') {
        throw new Error('Camera stop unhandled');
      } else {
        log.warn(`Error: Unknown capture event ${line}`);
      }
    }
  }

  /**
   * @private
   */
  _retrieveNextFrame() {
    if (this._frameQueue.length === 0) {
      return;
    }

    // Dequeue the next frame request
    let [userCb, when, formats] = this._frameQueue.shift();

    // Search the image in the cache
    let index = 0;
    for (index = 0; index < this._imagecache.size; index++) {
      let image = this._imagecache.get(index);
      if (image.when !== when) {
        continue;
      }

      let err = false;

      let frames = formats.map(format => { //eslint-disable-line no-loop-func
        switch(format) {
        case 'fullrgb':
          return image.fullrgb;
        case 'rgb':
          if (!image.rgb) {
            let rgb = image.fullrgb.copy();
            rgb.resize(FRAME_SIZE.normal.width, FRAME_SIZE.normal.height); // Slow!
            image.rgb = rgb;
          }
          return image.rgb;
        case 'fullgray':
          return image.fullgray;
        case 'highgray':
          if (!image.highgray) {
            let highgray = image.fullgray.copy();
            highgray.resize(FRAME_SIZE.high.width, FRAME_SIZE.high.height);
            image.highgray = highgray;
          }
          return image.highgray;
        case 'gray':
          return image.gray;
        case 'grayeq':
          if (!image.grayeq) {
            let grayImage = image.gray.copy();
            grayImage.equalizeHist();
            image.grayeq = grayImage;
          }
          return image.grayeq;
        case 'lowgray':
          if (!image.lowgray) {
            // TODO: Resize from fullgray instead?  This will be slower but
            // likely produce a better image.
            let lowgray = image.gray.copy();
            lowgray.resize(FRAME_SIZE.low.width, FRAME_SIZE.low.height);
            image.lowgray = lowgray;
          }
          return image.lowgray;
        default:
          err = `unsupported format: ${format}`;
          return null;
        }
      });

      userCb(err, frames);
      return;
    }
    userCb('image not available in the cache', null);
  }

  /**
   * @private
   */
  _scheduleNextFrameCapture() {
    // Camera frames are scheduled every FRAME_DELAY_MS wall clock
    const spilloverMs = Date.now() % FRAME_DELAY_MS;

    // Reduce FRAME_DELAY_MS by the spillover to get the next frame as close
    // as possible to +FRAME_DELAY_MS.
    // (+5 to ensure the timeout doesn't fire early by ~1ms)
    const requestedDelayMs = FRAME_DELAY_MS - spilloverMs + 5;

    const scheduledTime = Date.now();
    this._frameTimeout = setTimeout(() => {
      const realDelayMs = Date.now() - scheduledTime;
      if (realDelayMs >= FRAME_DELAY_MS * 1.5) {
        log.warn(`Camera frame was delayed by ${realDelayMs - requestedDelayMs}ms`);
      }

      this._frameTimeout = null;
      this._scheduleNextFrameCapture();
      this._captureNextFrame();
    }, requestedDelayMs);
  }

  /**
   * Read the next frame
   * @private
   */
  _captureNextFrame() {
    if (!this._cvVideoCapture || !this._recording) {
      return;
    }
    if (this._cvVideoCaptureBusy) {
      this._noFrameCount++;
      log.warn(`Waiting for camera frame: ` +
               `${this._noFrameCount}/${CAPTURE_PREVIEW_GRAB_MAX_ATTEMPTS}`);
      if (this._noFrameCount > CAPTURE_PREVIEW_GRAB_MAX_ATTEMPTS) {
        this._restart(`Camera frame timeout`, true);
      }
      return;
    }
    this._noFrameCount = 0;
    this._cvVideoCaptureBusy = true;
    let when = Date.now();

    // Use cvVideoCapture grab()/retrieve() as read() will only return the BRG
    // image
    let imRGB = new cv.Matrix();
    let imGray = new cv.Matrix();
    let imScaledGray = new cv.Matrix();

    this._cvVideoCapture.read(imRGB, imGray, imScaledGray, (err) => {
      if (err) {
        log.error(`Unable to fetch frame: err=${err}`);
        this._cvVideoCaptureBusy = false;
        return;
      }
      [when, imRGB, imGray, imScaledGray] =
        this._clipRecorder.maybeReplaceFrame(when, imRGB, imGray, imScaledGray);

      // Cache the camera frame
      this._imagecache.push({
        when,
        fullgray: imGray,
        fullrgb: imRGB,
        gray: imScaledGray,
      });

      log.debug(`Grab time: ${Date.now() - when}ms`);
      this._cvVideoCaptureBusy = false;

      // Add camera frame to the timeline
      this.timeline.addCameraFrame(when, imRGB);

      // Only emit the latest set of HAL-detected faces
      // (HAL can return multiple faces per preview, but it's not helpful to show
      //  them all on the preview)
      //
      // TODO: This code can probably be removed as we are not using HAL faces
      if (this.faces) {
        // Add faces only if there is motion
        if (this._motion) {
          if (this.faces.length > 0) {
            log.info(`Detected face=${this.faces.length}`);
          }
          this.timeline.addFace(when, this.faces, 'hal');
        }
      }
    });
  }

  /**
   * @private
   */
  _onDataSocketRead(newdata) {
    let buf;
    if (this._dataBuffer) {
      // Prepend previous incomplete packet
      buf = Buffer.concat([this._dataBuffer, newdata]);
    } else {
      buf = newdata;
    }

    let pos = 0;
    while (pos + HEADER_NR_BYTES < buf.length) {
      let size = buf.readInt32LE(pos);
      if (pos + HEADER_NR_BYTES + size > buf.length) {
        break; // Incomplete packet received
      }
      let tag = buf.readInt32LE(pos + 4);
      let now = tag === TAG_VIDEO ? Date.now() : null;
      let sec = buf.readInt32LE(pos + 8);   // timeval.tv_sec
      let usec = buf.readInt32LE(pos + 12); // timeval.tv_usec
      let durationMs = buf.readInt32LE(pos + 16);
      let when = sec * 1000 + Math.round(usec / 1000); // UTC ms since epoch

      let pkt = buf.slice(pos + HEADER_NR_BYTES, pos + HEADER_NR_BYTES + size);

      let tagInfo = `| size:${size} when:${sec}.${usec} durationMs:${durationMs}`;
      switch (tag) {
      case TAG_VIDEO:
        log.debug(`TAG_VIDEO ${when}`, tagInfo);
        this._videoTagReceived = true;
        if (this._recording) {
          this.timeline.addVideo(when, durationMs, pkt);
        }

        invariant(now);
        let socketDuration = now - when - durationMs;

        // This seems really unlikely but if the clock isn't perfect...
        if (socketDuration < 0) {
          log.warn(`Bad socketDuration: ${socketDuration}`);
          socketDuration = 0;
        }

        api.metrics.add(new VideoMetrics.Record(durationMs));
        api.metrics.add(new VideoMetrics.CaptureToNode(socketDuration));
        break;
      case TAG_FACES:
        log.debug(`TAG_FACES ${when}`, tagInfo);
        if (this._recording) {
          this.faces = rawFaceArrayToFaces(pkt).map(normalizeFace);
        }
        break;
      case TAG_MIC:
        log.debug(`TAG_MIC ${when}`, tagInfo);
        this._micTagReceived = true;
        if (this._recording) {
          this.emit('mic-data', {when: when, frames: pkt});
        }
        break;
      default:
        // Flush the buffer and restart the socket
        this._dataBuffer = null;
        this._restart('Invalid capture tag', true);
        throw new Error(`Invalid capture tag #${tag}`, tagInfo);
      }
      pos += HEADER_NR_BYTES + size;
    }
    if (pos !== buf.length) {
      this._dataBuffer = buf.slice(pos); // Save partial packet for next time
    } else {
      this._dataBuffer = null;
    }
  }

  /**
   * @private
   */
  _command(cmd) {
    if (this._ctlSocket === null) {
      log.warn(`Null ctlSocket, ignoring ${cmd}`);
      return false;
    }

    // Camera socket expects the command data in the following format
    let event = JSON.stringify(cmd) + '\0';

    this._ctlSocket.write(event);
    log.verbose(`camera << ${event}`);
    return true;
  }

  /**
   * Initialize camera stream
   */
  async init() {
    this._init();
    return Promise.resolve();
  }

  /**
   * Block until the camera is online and operational.
   * IMPORTANT: Since the camera can crash at any time, once this method returns
   *            it's never guaranteed that the camera is STILL online
   */
  /* async */ ready() {
    if (this._ready) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this.once('ready', resolve);
    });
  }

  /**
   * Start camera recording
   */
  startRecording() {
    if (!this._recording) {
      this._recording = true;
      log.verbose(`recording enabled (ready=${this._ready}`);
    }
  }

  /**
   * Stop camera recording
   */
  stopRecording() {
    if (this._recording) {
      this._recording = false;
      log.verbose(`recording disabled (ready=${this._ready})`);
    }
  }

  /**
   * Set flash mode as specified by flashMode parameter
   *
   * @param {string} flashMode flash-mode parameter to set in camera
   */
  flash(flashMode) {
    if (!FLASH_LIGHT_ENABLED) {
      log.warn(`flash light is not enabled`);
      return;
    }
    if (!this._ready) {
      log.error(`camera not ready, ignoring flash command`);
      return;
    }
    this._command({cmdName: 'setParameter', name: 'flash-mode', value: flashMode});
  }

  /**
   * Set mute mode
   *
   * @param {boolean} mute Mute mic true or false
   */
  setMute(mute) {
    // Persist mute setting if changed
    if (audioMute !== mute) {
      audioMute = mute;
      util.setprop(AUDIO_MUTE_PROP, audioMute);
    }

    if (!this._ready) {
      log.error(`camera not ready, ignoring setMute command`);
      return;
    }
    this._command({cmdName: 'update', cmdData: {audioMute}});
  }

  /**
   * Get integer camera parameter. This function returns a Promise that resolves
   * when the parameter value is successfully retrieved
   *
   * @param {string} name of camera parameter to get
   * @return {Promise}
   */
  async getParameterInt(name) {
    if (this._getParameterCallback) {
      throw new Error(`Re-entered getParameter?`);
    }
    if (!this._ready) {
      throw new Error(`camera not ready, ignoring getParameterInt command`);
    }

    if (!this._command({cmdName: 'getParameterInt', name})) {
      if (process.platform !== 'android') {
        if (name === 'max-num-detected-faces-hw') {
          return 0;
        }
      }
      throw new Error('Unable to issue command');
    }
    let getParamPromise = new Promise((resolve, reject) => {
      this._getParameterCallback = { resolve, reject };
    });
    return await getParamPromise;
  }

  /**
   * Get string camera parameter. This function returns a Promise that resolves
   * when the parameter value is successfully retrieved
   *
   * @param {string} name of camera parameter to get
   * @return {Promise}
   */
  async getParameterStr(name) {
    if (this._getParameterCallback) {
      throw new Error(`Re-entered getParameter?`);
    }
    if (!this._ready) {
      throw new Error(`camera not ready, ignoring getParameterStr command`);
    }

    if (!this._command({cmdName: 'getParameterStr', name})) {
      throw new Error('Unable to issue command');
    }
    let getParamPromise = new Promise((resolve, reject) => {
      this._getParameterCallback = { resolve, reject };
    });
    return await getParamPromise;
  }

  /**
   * Returns the camera video size.
   *
   * @return {Size}
   */
  get videoSize() {
    return { width: WIDTH, height: HEIGHT };
  }

  /**
   * Returns the camera frame size.
   *
   * @param frameSize Frame size of interest ('normal' if null)
   * @return {Size}
   */
  getFrameSize(frameSize: CameraFrameSize) {
    if (!frameSize || frameSize === '') {
      frameSize = 'normal';
    }
    if (typeof FRAME_SIZE[frameSize] !== 'object') {
      throw new Error(`Invalid frameSize: ${frameSize}`);
    }
    return FRAME_SIZE[frameSize];
  }

  /**
   * @private
   */
  static _scaleRect(rect: Rect, scale: number): Rect {
    return {
      x: Math.round(rect.x * scale),
      y: Math.round(rect.y * scale),
      width: Math.round(rect.width * scale),
      height: Math.round(rect.height * scale),
    };
  }

  /**
   * Scales normalized rectangles to the specified CameraFrameSize
   *
   * @param rects Array of normalized rectangles to scale
   * @param frameSize Desired scale
   * @return Array of rectangles in the desired scale
   */
  normalRectsTo(rects: Array<Rect>, frameSize: CameraFrameSize): Array<Rect> {
    const scale = this.getFrameSize(frameSize).width / FRAME_SIZE.normal.width;
    return rects.map(rect => Camera._scaleRect(rect, scale));
  }

  /**
   * Scales rectangles of the specified CameraFrameSize to the normal size
   *
   * @param rects Array of rectangles to normalize
   * @param frameSize Desired scale
   * @return Array of normalized rectangles
   */
  normalRectsFrom(rects: Array<Rect>, frameSize: CameraFrameSize): Array<Rect> {
    const scale = FRAME_SIZE.normal.width / this.getFrameSize(frameSize).width;
    return rects.map(rect => Camera._scaleRect(rect, scale));
  }


  /**
   * Obtain a camera frame in one or more formats
   *
   * @param when   - timestamp of the frame to get
   * @param formats - requested formats
   * @param userCb - callback that receives an error object and the image
   *                 as an OpenCV matrix
   */
  getFrame(when: number,
           formats: Array<CameraFrameFormat>,
           userCb: CameraCallback): void {
    this._frameQueue.push([userCb, when, formats]);
    this._retrieveNextFrame();
  }

  _diagEmitState = () => {
    if (!this._liveDiag) {
      return;
    }
    const state = {
      clipRecorder: this._clipRecorder.state,
    };
    this.server.send('diag', {
      type: 'state',
      name: 'camera',
      state,
    });
  };

  setDiag(enabled: bool): void {
    this._liveDiag = enabled;
    this._diagEmitState();
  }

  diagCommand(name: string, arg: string): void {
    switch (name) {
    case 'hi':
      break;
    case 'record':
      switch (arg) {
      case 'start':
        this._clipRecorder.startRecording();
        break;
      case 'stop':
        this._clipRecorder.stopRecording();
        break;
      default:
        log.error('Unknown record arg:', arg);
        break;
      }
      break;
    case 'live':
      this._clipRecorder.resumeLive();
      break;
    case 'playback':
      switch (arg) {
      case 'start':
        this._clipRecorder.startPlayback();
        break;
      case 'stop':
        this._clipRecorder.stopPlayback();
        break;
      default:
        log.error('Unknown playback arg:', arg);
        break;
      }
      break;
    case 'goto start':
      this._clipRecorder.seek(-Infinity);
      break;
    case 'rewind':
      this._clipRecorder.seek(-1000 / FRAME_DELAY_MS);
      break;
    case 'fastforward':
      this._clipRecorder.seek(1000 / FRAME_DELAY_MS);
      break;
    case 'goto end':
      this._clipRecorder.seek(Infinity);
      break;
    case 'repeat':
      this._clipRecorder.setRepeat(!!arg);
      break;
    case 'trim':
      switch (arg) {
      case 'before':
        this._clipRecorder.trimBefore();
        break;
      case 'after':
        this._clipRecorder.trimAfter();
        break;
      default:
        log.error('Unknown trim arg:', arg);
        break;
      }
      break;
    case 'load':
      this._clipRecorder.load(arg);
      break;
    case 'save':
      this._clipRecorder.save(arg);
      break;
    default:
      log.error('Unknown command name:', name);
      break;
    }
  }
}

Camera.prototype.FLASH_MODE = FLASH_MODE;
