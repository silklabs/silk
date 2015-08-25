/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

let log = require('./log')('camera');
import { EventEmitter } from 'events';
let util = require('./util');
let caps = require('./caps');
let net = require('net');
let cv = require('opencv');

//const FRONT = 1;
//const BACK = 0;

const DURATION_PROP = 'persist.silk.vidduration';
const DURATION = util.getintprop(DURATION_PROP, 1);

const FLASH_LIGHT_PROP = 'persist.silk.flash.enabled';
const FLASH_LIGHT_ENABLED = util.getboolprop(FLASH_LIGHT_PROP);

//
// Constants
//
const CAPTURE_CTL_SOCKET_NAME = '/dev/socket/capturectl';
const CAPTURE_DATA_SOCKET_NAME = '/dev/socket/captured';
const CAPTURE_COMMAND_NAME = 'CaptureCommand';


// These constants must match those in Channel.h
const HEADER_NR_BYTES = 16; // sizeof(Channel::Header)
const TAG_VIDEO = 0;
const TAG_PREVIEW = 1;
const TAG_FACES = 2;
const TAG_MIC = 3;

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
  }

  _restart(why) {
    if (!this._ready) {
      log.info(`camera restart pending (ignored "${why}")`);
      return;
    }
    log.info(`camera restart: ${why}`);
    this._ready = false;
    if (this._cvVideoCapture) {
      this._cvVideoCapture.close();
      this._cvVideoCapture = null;
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
      this._buffer = '';
      this._ready = true;
      if (cmdData) {
        PREVIEW_WIDTH = cmdData.width / cmdData.previewScale;
        PREVIEW_HEIGHT = cmdData.height / cmdData.previewScale;
        this.timeline.previewSize = {width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT};
        this._command({cmdName: 'init', cmdData: cmdData});
        this._command({cmdName: 'setParameter', name: 'focus-mode', value: 'continuous-video'});

        this._cvVideoCapture = new cv.VideoCapture(0);
        this._cvVideoCapture.setWidth(cmdData.width);
        this._cvVideoCapture.setHeight(cmdData.height);
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
        this.emit('start');
      } else if (captureEvent.eventName === 'stopped') {
        this.emit('stop');
      } else {
        log.warn(`Error: Unknown capture command ${line}`);
      }
    }
  }

  _grabPreviewFrame(when) {
    let busy = false;
    let queue = []; // Queue of pending preview frame requests
    let imagecache = []; // Cache to avoid resizing a frame multiple times

    let retrieveNextFrame = () => {
      if (busy || queue.length === 0) {
        return;
      }

      // Dequeue the next frame request
      let [userCb, channel] = queue.shift();

      if (imagecache[channel]) {
        // Frame is cached!
        userCb(false, imagecache[channel]);
        retrieveNextFrame();
        return;
      }

      busy = true;

      // Fetch the frame from the camera
      this._cvVideoCapture.retrieve(
        (err, im) => {
          if (!err) {
            im.resize(PREVIEW_WIDTH, PREVIEW_HEIGHT);
            imagecache[channel] = im;
          }
          busy = false;
          userCb(err, im);
          retrieveNextFrame();
        },
        channel
      );
    };

    // Grab the next frame
    this._cvVideoCapture.grab(() => {
      let now = Date.now();
      log.info(`Preview frame grabbed. lag=${now - when}ms`);

      imagecache = []; // Flush the image cache
      if (queue.length > 0) {
        log.warn(`Unable to keep up with preview. backlog=${queue.length}`);
      }

      // Add the frame to the timeline
      this.timeline.addPreviewFrame(now,
        (userCb, channel = 0) => {
          queue.push([userCb, channel]); // Enqueue the frame request
          retrieveNextFrame();
        }
      );
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
      let when = sec * 1000 + Math.round(usec / 1000); // UTC ms since epoch

      let pkt = this._dataBuffer.slice(HEADER_NR_BYTES, HEADER_NR_BYTES + size);
      switch (tag) {
        case TAG_PREVIEW:
          log.debug(`TAG_PREVIEW ${when}`);
          this.timeline.addPreviewJPEG(when, pkt);
          // TODO: Currently the OpenCV preview frames are tied to the capture
          //       preview frames for simplicity, however there's no reason why
          //       they couldn't be independent.
          this._grabPreviewFrame(when);
          break;
        case TAG_VIDEO:
          log.debug(`TAG_VIDEO ${when}`);
          this.timeline.addVideo(when, pkt);
          break;
        case TAG_FACES:
          log.debug(`TAG_FACES ${when}`);
          let faces = rawFaceArrayToFaces(pkt).map(normalizeFace);
          this.timeline.addFace(when, faces);
          break;
        case TAG_MIC:
          log.debug(`TAG_MIC ${when}`);
          this.emit('mic-data', {when: when, frame: pkt});
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

  ready() {
    return this._ready;
  }

  /**
   * Initialize camera
   */
  start() {
    let initargs;
    if (caps.has('qemu')) {
      initargs = {
        frameInterval: DURATION,
        width: 640,
        height: 480,
        fps: 10,
        vbr: 1024,
        previewScale: 4,
        previewSkipCount: 25
      };
    } else {
      initargs = {
        frameInterval: DURATION,
        width: 1280,
        height: 720,
        fps: 25,
        vbr: 1024,
        previewScale: 4,
        previewSkipCount: 25
      };
    }

    this._init(initargs);
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
}

CameraStream.prototype.FLASH_MODE = FLASH_MODE;
module.exports = (timeline) => new CameraStream(timeline);
