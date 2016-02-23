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
 * Type representing the camera preview frame callback
 *
 * @property {boolean} err True if the frame is retrieved succesfully, false
 *                         otherwise
 * @property {object} image Requested preivew image as per the specified
 *                          CameraPreviewFrameFormat format
 */
export type CameraCallback = (err: boolean, image: any) => void;

/**
 * The available preview frame formats:
 * rgb - downscaled RGB
 * gray - downscaled grayscale
 * grayeq - downscaled grayscale equalized
 * full - full resolution RGB
 */
export type CameraPreviewFrameFormat = 'rgb' | 'gray' | 'grayeq' | 'full';

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

const DURATION_PROP = 'persist.silk.vidduration';

// Clamp duration to 1..10 seconds. Any longer and the object metadata
// associated with a video clip could easily get too large for the server to
// handle (silk-device#1054).
const DURATION = Math.max(1, Math.min(util.getintprop(DURATION_PROP, 1), 10));

const WIDTH = util.getintprop('ro.silk.camera.width', 1280);
const HEIGHT = util.getintprop('ro.silk.camera.height', 720);
const FPS = util.getintprop('ro.silk.camera.fps', 24);
const VBR = util.getintprop('ro.silk.camera.vbr', 1024);
const PREVIEW_SCALE = util.getintprop('ro.silk.camera.preview_scale', 4);
const PREVIEW_DELAY_MS = 250;

const PREVIEW_WIDTH = WIDTH / PREVIEW_SCALE;
const PREVIEW_HEIGHT = HEIGHT / PREVIEW_SCALE;

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

// If there is still not a preview frame after this number of attempts assume the
// capture process is wedged and restart it.
const CAPTURE_PREVIEW_GRAB_MAX_ATTEMPTS = 5 * (1000 / PREVIEW_DELAY_MS);

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
  return {
    x: normCoord(left, PREVIEW_WIDTH),
    y: normCoord(top, PREVIEW_HEIGHT),
    width: normLen(right - left, PREVIEW_WIDTH),
    height: normLen(bottom - top, PREVIEW_HEIGHT),
    leftEye: [normCoord(face.leftEye[0], PREVIEW_WIDTH),
        normCoord(face.leftEye[1], PREVIEW_HEIGHT)],
    rightEye: [normCoord(face.rightEye[0], PREVIEW_WIDTH),
        normCoord(face.rightEye[1], PREVIEW_HEIGHT)],
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

type CameraClipPreviewFrame = [
  number, // when
  any,    // Full OpenCV matrix for this preview frame
  any,    // Scaled OpenCV matrix for this preview frame
];

/**
 * Represents the "clip recorder", which enables the recording and replay of
 * camera video streams
 */
class CameraClipRecorder {
  state: CameraClipRecorderState;

  _previews: CBuffer<CameraClipPreviewFrame>;
  _previewPosition: number;
  _onStateChange: Function;

  constructor(onStateChange: Function) {
    this._onStateChange = onStateChange;
    this._previewPosition = 0;
    this._previews = new CBuffer(MAX_CLIP_DURATION * 1000 / PREVIEW_DELAY_MS);
    this._previews.overflow = this._releasePreviewFrame;

    this.state = {
      mode: 'live',
      availableClips: [],
      msg: '',
      repeat: false,
    };
    this.reset();
    this._loadAvailableClips();
  }

  _releasePreviewFrame: ((item: CameraClipPreviewFrame) => void) = (item) => {
    item[1].release();
    item[2].release();
  };

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
    const previews = metadata.previews;
    this._previews.empty();
    this._previewPosition = 0;

    await previews.forEach(async (when) => {
      const imageFile = path.join(CAMERA_CLIP_DIRECTORY, 'img', `${when}.png`);
      if (!await fs.exists(imageFile)) {
        log.warn('Clip image does not exist:', imageFile);
        return;
      }
      log.verbose('Loading', imageFile);
      const imFull = await this._loadImage(imageFile);
      let imScaled = imFull.copy();
      imScaled.resize(PREVIEW_WIDTH, PREVIEW_HEIGHT);
      this._previews.push([when, imFull, imScaled]);
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
    const previews = this._previews.toArray();
    let metadata = {
      previews: previews.map(item => item[0]),
    };

    await mkdirp(path.join(CAMERA_CLIP_DIRECTORY, 'img'));
    const clipMetadataFile = path.join(CAMERA_CLIP_DIRECTORY, name + '.json');
    await fs.writeFile(clipMetadataFile, JSON.stringify(metadata, null, '  '));

    await previews.forEach(async (item) => {
      let [when, imFull] = item;
      const imageFile = path.join(CAMERA_CLIP_DIRECTORY, 'img', `${when}.png`);
      if (!await fs.exists(imageFile)) {
        log.verbose('Saving', imageFile);
        imFull.save(imageFile);
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

  previewFrame(when: number, imFull: any, imScaled: any): [number, any, any] {
    switch (this.state.mode) {
    case 'record':
      this._previews.push([when, imFull.copy(), imScaled.copy()]);
      // fall through
    case 'live':
      return [when, imFull, imScaled];
    default:
      if (this._previewPosition >= this._previews.size) {
        log.error('Invalid _previewPosition.',
          `${this._previewPosition} >= ${this._previews.size}`);
        this.stopPlayback();
        return [when, imFull, imScaled];
      }

      const preview = this._previews.get(this._previewPosition);

      let nextPreviewPosition = this._previewPosition;
      if (this.state.mode === 'play') {
        nextPreviewPosition++;
        if (nextPreviewPosition >= this._previews.size) {
          if (this.state.repeat) {
            nextPreviewPosition = 0;
          } else {
            nextPreviewPosition = this._previews.size - 1;
            this.stopPlayback();
          }
        }
      }
      this._previewPosition = nextPreviewPosition;

      imFull.release();
      imScaled.release();

      [when, imFull, imScaled] = preview;
      return [when, imFull.copy(), imScaled.copy()];
    }
  }

  resumeLive(): void {
    if (this.state.mode !== 'busy') {
      this.state.mode = 'live';
      this.state.msg = '';
      this._previews.empty();
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
      this._previewPosition = this._clamp(this._previewPosition + distance,
        0, Math.max(0, this._previews.size - 1));
      this.state.msg = `Seek to ${this._previewPosition}`;
    }
    this._onStateChange();
  }

  trimBefore(): void {
    if (this.state.mode === 'pause') {
      for (let i = 0; i < this._previewPosition; i++) {
        this._previews.shift();
      }
      this.state.msg = `Trimmed before ${this._previewPosition}`;
      this._previewPosition = 0;
    }
    this._onStateChange();
  }

  trimAfter(): void {
    if (this.state.mode === 'pause') {
      while (this._previews.size > this._previewPosition + 1) {
        this._previews.pop();
      }
      this.state.msg = `Trimmed after ${this._previewPosition}`;
      this._previewPosition = this._previews.size - 1;
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
    this._queue = []; // Queue of pending preview frame requests
    this._motion = true;

    this._liveDiag = false;
    this._clipRecorder = new CameraClipRecorder(this._diagEmitState);

    // Cache last few images to guarantee the consumers get the image they are
    // expecting and not the latest camera frame. Also helps prevent resizing a
    // frame multiple times. Image cache object has the following fields
    //   when:    timestamp
    //   orig:    original unmodified frame from camera
    //   default: default image // CV_CAP_ANDROID_COLOR_FRAME_BGR resized
    //   gray:    grayscale image // CV_CAP_ANDROID_GREY_FRAME resized
    //   rgb:     RGB image // CV_CAP_ANDROID_COLOR_FRAME_RGB resized
    this._imagecache = new CBuffer(NUM_IMAGES_TO_CACHE);
    this._imagecache.overflow = (item) => this._releasePreviewImages(item);

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
  }

  /**
   * Releases cached preview images when the preview object is removed from the
   * cache
   * @private
   */
  _releasePreviewImages(item) {
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

    if (this._previewFrameTimeout) {
      clearTimeout(this._previewFrameTimeout);
      this._previewFrameTimeout = null;
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
        this._cvVideoCapture = new silkcv.VideoCapture(0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
      } catch (err) {
        throw err;
      }
    }
  }

  _initStartPreview() {
    this.timeline.previewSize = {width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT};
    this._scheduleNextPreviewFrame();

    clearTimeout(this._initTimeout);
    this._initTimeout = null;

    this._ready = true;
    this.emit('ready');
  }

  _startSimMicCapture() {
    const mic = require('mic');
    // TODO: get audio params from global config
    let simMic = mic({
      bitwidth: 16,
      channels: 1,
      encoding: 'signed-integer',
      endian: 'little',
      rate: 8000,
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
        this._initStartPreview();
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
        frameInterval: DURATION,
        width: WIDTH,
        height: HEIGHT,
        fps: FPS,
        vbr: VBR,
        audioMute,
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

        this._initStartPreview();
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
    if (this._queue.length === 0) {
      return;
    }

    // Dequeue the next frame request
    let [userCb, when, format] = this._queue.shift();

    // Search the image in the cache
    let index = 0;
    for (index = 0; index < this._imagecache.size; index++) {
      let image = this._imagecache.get(index);
      if (image.when !== when) {
        continue;
      }

      switch(format) {
      case 'rgb':
        userCb(false, image.rgb);
        return;
      case 'gray':
        if (image.gray) {
          userCb(false, image.gray);
        } else {
          let grayImage = image.rgb.copy();
          grayImage.convertGrayscale();
          image.gray = grayImage;
          userCb(false, image.gray);
        }
        return;
      case 'grayeq':
        if (image.grayeq) {
          userCb(false, image.grayeq);
        } else {
          if (!image.gray) {
            let grayImage = image.rgb.copy();
            grayImage.convertGrayscale();
            image.gray = grayImage;
          }

          let grayImage = image.gray.copy();
          grayImage.equalizeHist();

          image.grayeq = grayImage;
          userCb(false, image.grayeq);
        }
        return;
      case 'full':
        userCb(false, image.orig);
        return;
      default:
        userCb(`unsupported format: ${format}`, null);
        return;
      }
    }
    userCb('image not available in the cache', null);
  }

  /**
   * @private
   */
  _scheduleNextPreviewFrame() {
    // Preview frames are scheduled every PREVIEW_DELAY_MS wall clock
    const spilloverMs = Date.now() % PREVIEW_DELAY_MS;

    // Reduce PREVIEW_DELAY_MS by the spillover to get the next frame as close
    // as possible to +PREVIEW_DELAY_MS.
    // (+5 to ensure the timeout doesn't fire early by ~1ms)
    const requestedDelayMs = PREVIEW_DELAY_MS - spilloverMs + 5;

    const scheduledTime = Date.now();
    this._previewFrameTimeout = setTimeout(() => {
      const realDelayMs = Date.now() - scheduledTime;
      if (realDelayMs >= PREVIEW_DELAY_MS * 1.5) {
        log.warn(`Preview frame was delayed by ${realDelayMs - requestedDelayMs}ms`);
      }

      this._previewFrameTimeout = null;
      this._scheduleNextPreviewFrame();
      this._readPreviewFrame();
    }, requestedDelayMs);
  }

  /**
   * Read the next frame
   * @private
   */
  _readPreviewFrame() {
    if (!this._cvVideoCapture || !this._recording) {
      return;
    }
    if (this._cvVideoCaptureBusy) {
      this._noPreviewCount++;
      log.warn(`Waiting for preview frame: ` +
               `${this._noPreviewCount}/${CAPTURE_PREVIEW_GRAB_MAX_ATTEMPTS}`);
      if (this._noPreviewCount > CAPTURE_PREVIEW_GRAB_MAX_ATTEMPTS) {
        this._restart(`Preview frame timeout`, true);
      }
      return;
    }
    this._noPreviewCount = 0;
    this._cvVideoCaptureBusy = true;
    let when = Date.now();

    // Use cvVideoCapture grab()/retrieve() as read() will only return the BRG
    // image
    let imFull = new cv.Matrix();
    let imScaled = new cv.Matrix();

    this._cvVideoCapture.read(imFull, imScaled, (err) => {
      if (err) {
        log.error(`Unable to fetch frame: err=${err}`);
        this._cvVideoCaptureBusy = false;
        return;
      }
      [when, imFull, imScaled] = this._clipRecorder.previewFrame(when, imFull, imScaled);

      // Cache preview frames
      this._imagecache.push({when, orig: imFull, rgb: imScaled});

      log.debug(`Grab time: ${Date.now() - when}ms`);
      this._cvVideoCaptureBusy = false;

      // Add frames to the timeline
      this.timeline.addPreviewFrame(when, imScaled);

      // Only emit the latest set of HAL-detected faces
      // (HAL can return multiple faces per preview, but it's not helpful to show
      //  them all on the preview)
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
   * Returns the camera preview size (or null until the camera has successfully
   * initialized once)
   *
   * @return {Size}
   */
  get previewSize() {
    return { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };
  }

  /**
   * Invoke this function to obtain the preview frame
   *
   * @param when   - timestamp of the frame to get
   * @param format - requested format
   * @param userCb - callback that receives an error object and the image
   *                 as an OpenCV matrix
   */
  getPreviewFrame(when: number,
                  format: CameraPreviewFrameFormat,
                  userCb: CameraCallback): void {
    this._queue.push([userCb, when, format]); // Enqueue the frame request
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
      this._clipRecorder.seek(-1000 / PREVIEW_DELAY_MS);
      break;
    case 'fastforward':
      this._clipRecorder.seek(1000 / PREVIEW_DELAY_MS);
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
