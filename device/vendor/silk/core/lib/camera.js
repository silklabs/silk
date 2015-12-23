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
const DURATION = Math.max(1,Math.min(util.getintprop(DURATION_PROP, 1), 10));

const WIDTH = util.getintprop('ro.silk.camera.width', 1280);
const HEIGHT = util.getintprop('ro.silk.camera.height', 720);
const FPS = util.getintprop('ro.silk.camera.fps', 24);
const VBR = util.getintprop('ro.silk.camera.vbr', 1024);
const PREVIEW_SCALE = util.getintprop('ro.silk.camera.preview_scale', 4);
const PREVIEW_SKIP_COUNT = util.getintprop('ro.silk.camera.preview_skip_cnt', 12);
const PREVIEW_DELAY_MS = 1000 / (FPS / PREVIEW_SKIP_COUNT);

const FLASH_LIGHT_PROP = 'persist.silk.flash.enabled';
const FLASH_LIGHT_ENABLED = util.getboolprop(FLASH_LIGHT_PROP);

const AUDIO_MUTE_PROP = 'persist.silk.capture.mute';
let audioMute = util.getboolprop(AUDIO_MUTE_PROP, true);

//
// Constants
//
const CAPTURE_CTL_SOCKET_NAME = '/dev/socket/capturectl';
const CAPTURE_DATA_SOCKET_NAME = '/dev/socket/captured';
const CAPTURE_COMMAND_NAME = 'CaptureCommand';


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
const CAPTURE_PREVIEW_GRAB_MAX_ATTEMPTS = 10;

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
 * Class that talks to capture service to receive camera frames
 */
class CameraStream extends EventEmitter {
  constructor(timeline) {
    super();
    this.timeline = timeline;
    this._ready = false;
    this._recording = false;
    this._cvVideoCapture = null;
    this._cvVideoCaptureBusy = false;
    this._queue = []; // Queue of pending preview frame requests
    this._motion = true;

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

  /**
   * Restarts communication with the capture process.
   *
   * In certain error conditions, it can also be beneficial to restart the
   * capture process (such as when it is not providing the expected video data)
   * an attempt to recover the system.
   */
  _restart(why, restartCaptureProcess = false) {
    if (this._restartTimeout) {
      log.info(`camera restart pending (ignored "${why}")`);
      return;
    }

    log.warn(`camera restart: ${why} captureRestart=${restartCaptureProcess}`);
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

      if (!this._cvVideoCapture) {
        // Initialize the OpenCV video capture before sending 'init' to the
        // capture process to enable capture's 'init' implementation to run more
        // efficiently.
        try {
          this._cvVideoCapture = new cv.VideoCapture(0);
        } catch (err) {
          throw err;
        }
      }

      this._buffer = '';
      const cmdData = {
        frameInterval: DURATION,
        width: WIDTH,
        height: HEIGHT,
        fps: FPS,
        vbr: VBR,
        audioMute
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
        PREVIEW_WIDTH = WIDTH / PREVIEW_SCALE;
        PREVIEW_HEIGHT = HEIGHT / PREVIEW_SCALE;
        this.timeline.previewSize = {width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT};

        this._command({cmdName: 'setParameter', name: 'focus-mode', value: 'continuous-video'});
        this._scheduleNextPreviewFrame();

        const tagMonitor = () => {
          if (this._videoTagReceived && this._micTagReceived) {
            this._videoTagReceived = this._micTagReceived = null;
            this._tagMonitorTimeout = setTimeout(tagMonitor,
              CAPTURE_TAG_TIMEOUT_MS);
            return;
          }
          this._restart(`Expected Tags not received from capture promptly. ` +
              `video=${this._videoTagReceived}, mic=${this._micTagReceived}`,
              true);
        };
        this._tagMonitorTimeout = setTimeout(tagMonitor,
          CAPTURE_TAG_TIMEOUT_MS);

        clearTimeout(this._initTimeout);
        this._initTimeout = null;

        this._ready = true;
        this.emit('ready');
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
        userCb(false, image.rgb, image.orig);
        return;
      case 1:
        if (image.gray) {
          userCb(false, image.gray, image.orig);
        } else {
          let grayImage = image.rgb.copy();
          grayImage.convertGrayscale();

          // TODO: Running equalizeHist() on the full resolution image
          // could produce a better result than running it here on the
          // downscaled image at the expense of time.  Is it worth it?
          grayImage.equalizeHist();

          image.gray = grayImage;
          userCb(false, image.gray, image.orig);
        }
        return;
      default:
        userCb('unsupported channel', null);
        return;
      }
    }
    userCb('image not available in the cache', null);
  }

  _scheduleNextPreviewFrame() {
    this._previewFrameTimeout = setTimeout(() => {
      this._previewFrameTimeout = null;
      this._readPreviewFrame();
    }, PREVIEW_DELAY_MS);
  }

  /**
   * Read the next frame
   */
  _readPreviewFrame() {
    this._scheduleNextPreviewFrame();
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

    // Use cvVideoCapture grab()/retrieve() as read() will only return the BRG
    // image
    this._cvVideoCapture.grab(errGrab => {
      if (errGrab) {
        log.error(`Grab failed: ${errGrab}`);
        this._cvVideoCaptureBusy = false;
        return;
      }
      this._cvVideoCapture.retrieve((err, im) => {
        this._cvVideoCaptureBusy = false;

        if (err || (im.width() <= 0) || (im.height() <= 0)) {
          log.error(`Unable to fetch frame: err=${err} width=${im.width()} height=${im.height()}`);
          return;
        }

        // Scaled preview
        let imScaled = im.copy();
        imScaled.resize(PREVIEW_WIDTH, PREVIEW_HEIGHT);

        // Encode preview as JPEG to be sent to the server
        imScaled.toBufferAsync((err, pkt) =>{
          let when = Date.now();
          // Cache preview frames
          this._imagecache.push({when: when, orig: im, rgb: imScaled});

          // Add frames to the timeline
          this.timeline.addPreviewJPEG(when, PREVIEW_DELAY_MS, pkt);
          this.timeline.addPreviewFrame(when);

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

        }, {ext: '.jpg', jpegQuality: 100});
      }, 2 /* = CV_CAP_ANDROID_COLOR_FRAME_RGB */);
    });
  }

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
    if (pos != buf.length) {
      this._dataBuffer = buf.slice(pos); // Save partial packet for next time
    } else {
      this._dataBuffer = null;
    }
  }

  _command(cmd) {
    // Camera socket expects the command data in the following format
    let event = CAPTURE_COMMAND_NAME + ' ' + '\"' + util.escape(JSON.stringify(cmd)) + '\"' + '\0';

    this._ctlSocket.write(event);
    log.verbose(`camera << ${event}`);
  }

  /**
   * Initialize camera
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

  startRecording() {
    if (!this._recording) {
      this._recording = true;
      log.verbose(`recording enabled (ready=${this._ready}`);
    }
  }

  stopRecording() {
    if (this._recording) {
      this._recording = false;
      log.verbose(`recording disabled (ready=${this._ready})`);
    }
  }

  /**
   * Set flash mode as specified by flashMode parameter
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
   * Get integer camera parameter
   */
  async getParameterInt(name) {
    if (this._getParameterCallback) {
      throw new Error(`Re-entered getParameter?`);
    }
    if (!this._ready) {
      throw new Error(`camera not ready, ignoring getParameterInt command`);
    }

    let getParamPromise = new Promise((resolve, reject) => {
      this._getParameterCallback = { resolve, reject };
    });
    this._command({cmdName: 'getParameterInt', name});
    return await getParamPromise;
  }

  /**
   * Get string camera parameter
   */
  async getParameterStr(name) {
    if (this._getParameterCallback) {
      throw new Error(`Re-entered getParameter?`);
    }
    if (!this._ready) {
      throw new Error(`camera not ready, ignoring getParameterStr command`);
    }

    let getParamPromise = new Promise((resolve, reject) => {
      this._getParameterCallback = { resolve, reject };
    });
    this._command({cmdName: 'getParameterStr', name});
    return await getParamPromise;
  }

  /**
   * Returns the camera preview size (or null until the camera has successfully
   * initialized once)
   *
   */
  get previewSize() {
    if (PREVIEW_WIDTH === 0) {
      return null;
    }
    return { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };
  }

  /**
   * Invoke this function to obtain the preview frame
   *    userCb   - the callback that receives an error object, scaled image
   *               as an OpenCV matrix and the original image
   *    when     - timestamp of the frame to get
   *    channel  - 0 for RGB                 (CV_CAP_ANDROID_COLOR_FRAME_RGB)
   *               1 for grayscale equalized (CV_CAP_ANDROID_GREY_FRAME + cv::equalizeHist)
   */
  getPreviewFrame(userCb, when, channel = 0) {
    this._queue.push([userCb, when, channel]); // Enqueue the frame request
    this._retrieveNextFrame();
  }
}

CameraStream.prototype.FLASH_MODE = FLASH_MODE;
module.exports = (timeline) => new CameraStream(timeline);
