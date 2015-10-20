/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import createLog from './log';
import { EventEmitter } from 'events';
import * as util from './sysutils';
import net from 'net';
import cv from 'opencv';
import CBuffer from 'CBuffer';

//const FRONT = 1;
//const BACK = 0;

const log = createLog('camera');

const DURATION_PROP = 'persist.silk.vidduration';
const DURATION = util.getintprop(DURATION_PROP, 1);

const WIDTH = util.getintprop('ro.silk.camera.width', 1280);
const HEIGHT = util.getintprop('ro.silk.camera.height', 720);
const FPS = util.getintprop('ro.silk.camera.fps', 24);
const VBR = util.getintprop('ro.silk.camera.vbr', 1024);
const PREVIEW_SCALE = util.getintprop('ro.silk.camera.preview_scale', 4);
const PREVIEW_SKIP_COUNT = util.getintprop('ro.silk.camera.preview_skip_cnt', 6);

const FLASH_LIGHT_PROP = 'persist.silk.flash.enabled';
const FLASH_LIGHT_ENABLED = util.getboolprop(FLASH_LIGHT_PROP);

//
// Constants
//
const CAPTURE_CTL_SOCKET_NAME = '/dev/socket/capturectl';
const CAPTURE_DATA_SOCKET_NAME = '/dev/socket/captured';
const CAPTURE_COMMAND_NAME = 'CaptureCommand';


// These constants must match those in Channel.h
const HEADER_NR_BYTES = 20; // sizeof(Channel::Header)
const TAG_VIDEO = 0;
const TAG_FACES = 1;
const TAG_MIC = 2;

const NUM_IMAGES_TO_CACHE = 10;

/**
 * Flash modes as defined in <camera/CameraParameters.cpp>
 */
let FLASH_MODE = {
  OFF: 'off',
  AUTO: 'auto',
  ON: 'on',
  RED_EYE: 'red-eye',
  TORCH: 'torch'
};

/**
 * Return the raw Buffer of bytes `buf` parsed into array of face
 * objects with fields named after `camera_face_t` in
 * system/core/include/system/camera.h.
 */
function rawFaceArrayToFaces(buf) {
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
 */
let PREVIEW_WIDTH = 0;
let PREVIEW_HEIGHT = 0;
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
  face.x = normCoord(left, PREVIEW_WIDTH);
  face.y = normCoord(top, PREVIEW_HEIGHT);
  face.width = normLen(right - left, PREVIEW_WIDTH);
  face.height = normLen(bottom - top, PREVIEW_HEIGHT);
  return face;
}

/**
 * Class that talks to capture service to receive camera frames
 */
class CameraStream extends EventEmitter {
  constructor(timeline) {
    super();
    this.timeline = timeline;
    this._ready = false;
    this._cvVideoCapture = null;
    this._cvVideoCaptureBusy = false;
    this._queue = []; // Queue of pending preview frame requests

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
  }

  /**
   * Releases cached preview images when the preview object is removed from the
   * cache
   */
  _releasePreviewImages(item) {
    for (let key in item) {
      if (!item.hasOwnProperty(key)) {
        continue;
      }
      if ((key !== 'when') && item[key]) {
        item[key].release();
      }
    }
  }

  _restart(why) {
    if (!this._ready) {
      log.info(`camera restart pending (ignored "${why}")`);
      return;
    }
    log.info(`camera restart: ${why}`);
    this._ready = false;
    if (this._previewInterval) {
      clearInterval(this._previewInterval);
      this._previewInterval = null;
    }
    if (this._cvVideoCapture) {
      this._cvVideoCapture.close();
      this._cvVideoCapture = null;
      this._cvVideoCaptureBusy = false;
    }
    this._ctlSocket.destroy();
    this._ctlSocket = null;
    this._dataSocket.destroy();
    this._dataSocket = null;

    util.timeout(1000)
    .then(() => this._init())
    .catch(util.processthrow);
  }

  _init(cmdData = null /*null expected on reconnect*/) {
    if (this._ready) {
      log.info(`camera already initialized`);
      return;
    }

    // Connecting to data socket
    this._dataBuffer = new Buffer(0);
    log.verbose(`connecting to ${CAPTURE_DATA_SOCKET_NAME} socket`);
    this._dataSocket = net.createConnection(CAPTURE_DATA_SOCKET_NAME, () => {
      log.verbose(`connected to ${CAPTURE_DATA_SOCKET_NAME} socket`);
      this._dataBuffer = new Buffer(0);
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

      if (!this._cvVideoCapture) {
        // Initialize the OpenCV video capture before sending 'init' to the
        // capture process to enable capture's 'init' implementation to run more
        // efficiently.
        try {
          this._cvVideoCapture = new cv.VideoCapture(0);
        } catch (err) {
          if (this._startPromiseCallbacks) {
            return this._startPromiseCallbacks.reject(err);
          }
          throw err;
        }
      }

      this._buffer = '';
      this._ready = true;
      if (cmdData) {
        this._videoWidth = cmdData.width;
        this._videoHeight = cmdData.height;

        PREVIEW_WIDTH = cmdData.width / PREVIEW_SCALE;
        PREVIEW_HEIGHT = cmdData.height / PREVIEW_SCALE;
        this.timeline.previewSize = {width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT};
        this._command({cmdName: 'init', cmdData: cmdData});
      }
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
        this.emit('error');
      } else if (captureEvent.eventName === 'initialized') {
        this._command({cmdName: 'setParameter', name: 'focus-mode', value: 'continuous-video'});

        let delay = 1000 / (FPS / PREVIEW_SKIP_COUNT);
        this._previewInterval = setInterval(() => this._readPreviewFrame(), delay);

        if (this._startPromiseCallbacks) {
          this._startPromiseCallbacks.resolve();
        }
      } else if (captureEvent.eventName === 'stopped') {
        throw new Error('Camera stop unhandled');
      } else {
        log.warn(`Error: Unknown capture command ${line}`);
      }
    }
  }

  _retrieveNextFrame() {
    if (this._queue.length === 0) {
      return;
    }

    // Dequeue the next frame request
    let [userCb, when, channel] = this._queue.shift();

    // Search the image in the cache
    let index = 0;
    for (index = 0; index < this._imagecache.size; index++) {
      let image = this._imagecache.get(index);
      if (image.when !== when) {
        continue;
      }

      switch(channel) {
      case 0:
        userCb(false, image.default, image.orig);
        return;
      case 1:
        if (image.gray) {
          userCb(false, image.gray, image.orig);
        } else {
          let grayImage = image.default.copy();
          grayImage.convertGrayscale();

          // TODO: Running equalizeHist() on the full resolution image
          // could produce a better result than running it here on the
          // downscaled image at the expense of time.  Is it worth it?
          grayImage.equalizeHist();

          image.gray = grayImage;
          userCb(false, image.gray, image.orig);
        }
        return;
      case 2:
        userCb(false, image.rgb, image.orig);
        return;
      default:
        userCb('unsupported channel', null);
        return;
      }
    }
    userCb('image not available in the cache', null);
  }

  /**
   * Read the next frame
   */
  _readPreviewFrame() {
    if (!this._cvVideoCapture) {
      return;
    }
    if (this._cvVideoCaptureBusy) {
      log.warn('Still waiting on preview frame, unable to read next');
      return;
    }
    this._cvVideoCaptureBusy = true;
    this._cvVideoCapture.read((err, im) => {
      this._cvVideoCaptureBusy = false;

      if (err || (im.width() <= 0) || (im.height() <= 0)) {
        log.error(`Unable to fetch frame: err=${err} width=${im.width()} height=${im.height()}`);
        return;
      }

      // Scaled preview
      let imScaled = im.copy();
      imScaled.resize(PREVIEW_WIDTH, PREVIEW_HEIGHT);

      // RGB preview
      let rgbImage = imScaled.copy();
      rgbImage.cvtColor('CV_BGR2RGB');

      // Encode preview as JPEG to be sent to the server
      rgbImage.toBufferAsync((err, pkt) =>{
        let when = Date.now();

        // Cache preview frames
        this._imagecache.push({when: when, orig: im, default: imScaled, rgb: rgbImage});

        // Add frames to the timeline
        this.timeline.addPreviewJPEG(when, pkt);
        this.timeline.addPreviewFrame(when);
      }, {ext: '.jpg', jpegQuality: 100});
    });
  }

  _onDataSocketRead(data) {
    this._dataBuffer = Buffer.concat([this._dataBuffer, data]);
    while (this._dataBuffer.length >= HEADER_NR_BYTES) {
      let size = this._dataBuffer.readInt32LE(0);
      if (this._dataBuffer.length < HEADER_NR_BYTES + size) {
        break;
      }
      let tag = this._dataBuffer.readInt32LE(4);
      let sec = this._dataBuffer.readInt32LE(8);   // timeval.tv_sec
      let usec = this._dataBuffer.readInt32LE(12); // timeval.tv_usec
      let durationMs = this._dataBuffer.readInt32LE(16);
      let when = sec * 1000 + Math.round(usec / 1000); // UTC ms since epoch

      let pkt = this._dataBuffer.slice(HEADER_NR_BYTES, HEADER_NR_BYTES + size);
      switch (tag) {
      case TAG_VIDEO:
        log.debug(`TAG_VIDEO ${when}`);
        this.timeline.addVideo(when, durationMs, pkt);
        break;
      case TAG_FACES:
        log.debug(`TAG_FACES ${when}`);
        let faces = rawFaceArrayToFaces(pkt).map(normalizeFace);
        this.timeline.addFace(when, faces, 'hal');
        break;
      case TAG_MIC:
        log.debug(`TAG_MIC ${when}`);
        this.emit('mic-data', {when: when, frames: pkt});
        break;
      default:
        // Flush the buffer and restart the socket
        this._dataBuffer = new Buffer(0);
        this._restart('Invalid capture tag');
        throw new Error(`Invalid capture tag: ${tag}`);
      }
      // put the rest of the buffer back
      let rest = new Buffer(this._dataBuffer.length - (HEADER_NR_BYTES + size));
      this._dataBuffer.copy(rest, 0, HEADER_NR_BYTES + size);
      this._dataBuffer = rest;
    }
  }

  _command(cmd) {
    if (!this._ready) {
      log.error(`camera service not ready, ignoring the command ${cmd.cmdName}`);
      return;
    }

    // Camera socket expects the command data in the following format
    let event = CAPTURE_COMMAND_NAME + ' ' + '\"' + util.escape(JSON.stringify(cmd)) + '\"' + '\0';

    this._ctlSocket.write(event);
    log.verbose(`camera << ${event}`);
  }

  /**
   * Initialize camera
   */
  async start() {
    if (this._startPromiseCallbacks) {
      throw new Error('Re-entered start?');
    }

    let startPromise = new Promise((resolve, reject) => {
      this._startPromiseCallbacks = { resolve, reject };
    });
    this._init({
      frameInterval: DURATION,
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      vbr: VBR,
    });
    await startPromise;
  }

  /**
   * Set flash mode as specified by flashMode parameter
   */
  flash(flashMode) {
    if (!FLASH_LIGHT_ENABLED) {
      log.warn(`flash light is not enabled`);
      return;
    }
    this._command({cmdName: 'setParameter', name: 'flash-mode', value: flashMode});
  }

  /**
   *
   */
  get previewSize() {
    return { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };
  }

  /**
   * Invoke this function to obtain the preview frame
   *    userCb   - the callback that receives an error object, scaled image
   *               as an OpenCV matrix and the original image
   *    when     - timestamp of the frame to get
   *    channel  - 0 (default) for color     (CV_CAP_ANDROID_COLOR_FRAME_BGR)
   *               1 for grayscale equalized (CV_CAP_ANDROID_GREY_FRAME + cv::equalizeHist)
   *               2 for RGB                 (CV_CAP_ANDROID_COLOR_FRAME_RGB)
   */
  getPreviewFrame(userCb, when, channel = 0) {
    this._queue.push([userCb, when, channel]); // Enqueue the frame request
    this._retrieveNextFrame();
  }
}

CameraStream.prototype.FLASH_MODE = FLASH_MODE;
module.exports = (timeline) => new CameraStream(timeline);
