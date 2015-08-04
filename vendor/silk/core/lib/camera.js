/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let log = require('./log')('camera');
import api from './api';
import { EventEmitter } from 'events';
let util = require('./util');
let net = require('net');

//const FRONT = 1;
const BACK = 0;
const DURATION = 1;

const UPLOAD_PROP = 'persist.silk.vidupload.enabled';
const UPLOAD_ENABLED = util.getboolprop(UPLOAD_PROP);
const FLASH_LIGHT_PROP = 'persist.silk.flash.enabled';
const FLASH_LIGHT_ENABLED = util.getboolprop(FLASH_LIGHT_PROP);

//Content type must be set to make clients happy later on.
const VIDEO_CONTENT_TYPE = 'video/mp4';

//
// Constants
//
const CAPTURE_CTL_SOCKET_NAME = '/dev/socket/capturectl';
const CAPTURE_DATA_SOCKET_NAME = '/dev/socket/captured';
const CAPTURE_COMMAND_NAME = 'CaptureCommand';

const HEADER_NR_BYTES = 16;
const TAG_VIDEO = 0;
const TAG_PREVIEW = 1;
const TAG_FACES = 2;

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
  const WIDTH = 1280, HEIGHT = 768;
  let normLen = (l, len) => (len * l / 2000.0) | 0;
  let normCoord = (c, len) => normLen(c + 1000.0, len);
  face.x = normCoord(left, WIDTH);
  face.y = normCoord(top, HEIGHT);
  face.width = normLen(right - left, WIDTH);
  face.height = normLen(bottom - top, HEIGHT);
  face.fieldWidth = WIDTH;
  face.fieldHeight = HEIGHT;
  return face;
}

class VideoUploadQueue extends EventEmitter {
  /**
  * @param {String} id device id.
  * @param {Number} duration in milliseconds.
  */
  constructor(id, duration) {
    super();
    this.id = id;

    // We could later make this more generic and do logging.
    this.type = 'video';

    // XXX: This is a hack until we have percise timing info on when the
    // segment has ended (in utc).
    this.duration = duration;

    this.previousId = undefined;
    this.running = false;
    this.queue = [];
  }

  /**
  Add a new item to the queue to be uploaded.

  @param {Number} when utc time when the frame was created.
  @param {}
  */
  add(when, frame, faces) {
    this.queue.push({
      when,
      frame,
      faces
    });
    this.start();
  }

  /**
  To make it easy on the consumer we define metadata as an ordered list... To
  do this we need to know the previous id we uploaded.
  */
  _resolveLastId() {
    // Specifically checking for undefined so we only run this logic once.
    if (this.previousId !== undefined) {
      return Promise.resolve(this.previousId);
    }

    return Promise.resolve().then(() => {
      // XXX: The below does do much right now since device is is unique each
      // boot currently.
      //
      // We don't have a previous id so attempt to find the closest segment.
      return api.timeMeta.findByTime({
        metaType: this.type,
        deviceId: this.id,
        time: Date.now()
      });
    }).then((result) => {
      return result.id;
    }).catch((err) => {
      log.warn('Could not find previous metadata item', err);
      // TODO: In the future an error finding the last id should be fatal or
      // something we need to resolve when we come back online for now we just
      // assume the server messed up and we start again from no previous item.
      return null;
    });
  }

  _uploadItem(previousId, item) {
    let start = Date.now();
    let { when, frame, faces } = item;
    let metadataPayload = {
      metaType: this.type,
      deviceId: this.id,
      startUTC: when,
      endUTC: when + this.duration,
      data: {
        faces
      }
    };

    if (previousId) {
      metadataPayload.previousId = previousId;
    }

    // step 1 is to upload the data...
    return api.blob.uploadAndAck(frame.length, frame, VIDEO_CONTENT_TYPE).then((result) => {
      // step 2. upload the metadata...
      metadataPayload.url = result.url;
      return api.timeMeta.create(metadataPayload);
    }).then((result) => {
      this.previousId = result.id;
      log.info(
        'uploaded item id: %s, url: %s took %d ms',
        result.id,
        metadataPayload.url,
        Date.now() - start
      );
    });
  }

  _work() {
    // Shift an  item off first thing so we don't get stuck in a loop.
    let item = this.queue.shift();
    log.info('uploading item size: %d, time: %d', item.frame.length, item.when);

    this._resolveLastId().then((previousId) => {
      return this._uploadItem(previousId, item);
    }).catch(err => {
      // XXX: In some cases we may want to retry an upload not now though.
      log.error('Error working item off video upload queue', err);
    }).then(() => {
      if (this.queue.length) {
        // A little trick continue to work but don't use one huge promise chain.
        process.nextTick(() => {
          this._work();
        });
      } else {
        // No more work signal a stop.
        this.stop();
      }
    });
  }

  /**
  Start working the queue (it is safe to call this multiple times)
  */
  start() {
    // Already working...
    if (this.running) {
      return;
    }
    this.running = true;
    this.emit('starting');
    this._work();
  }

  /**
  Stop working the queue (will not abort any running work).
  */
  stop() {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.emit('stopping');
  }

}

/**
 * Class that talks to capture service to receive camera frames and send to the
 * server on the provided server socket
 */
class CameraStream extends EventEmitter {
  constructor(id) {
    super();
    this.id = id;
    this._ready = false;
    this.faces = [];
    this.videoUploads = new VideoUploadQueue(this.id, DURATION * 1000);

    // Keep track of all face packets we send and upload them along with the
    // metadata for video segments.
    this.facePackets = [];
  }

  _restart(why) {
    if (!this._ready) {
      log.info(`camera restart pending (ignored "${why}")`);
      return;
    }
    this._ready = false;
    this._ctlSocket.destroy();
    this._ctlSocket = null;
    this._dataSocket.destroy();
    this._dataSocket = null;

    log.info(`camera restart: ${why}`);
    util.timeout(1000)
    .then(() => this._init());
  }

  _init(cmdData) {
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
      this._command({cmdName: 'init', cmdData: cmdData});
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
          this._pushPreview(when, pkt);
          break;
        case TAG_VIDEO:
          this._pushVideo(when, pkt);
          break;
        case TAG_FACES:
          this.faces = rawFaceArrayToFaces(pkt).map(normalizeFace);
          this.emit('face', this.faces);
          this._pushFace(when);
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

  _pushPreview(when, frame) {
    this._pushPacket(when, frame, this.faces, 'jpeg');
  }

  _pushFace(when) {
    this._pushPacket(when, null, this.faces, 'faces');
    this.facePackets.push({ when, faces: this.faces });
  }

  _pushVideo(when, frame) {
    // For video we group all related face packets to make it easier on the
    // client.
    this._pushPacket(when, frame, this.facePackets, 'mp4');
    if (UPLOAD_ENABLED) {
      this.videoUploads.add(when, frame, this.facePackets);
    }
    this.facePackets = [];
  }

  _pushPacket(when, frame, faces, type) {
    let str = `packet:${type}: size:${frame ? frame.length : 0} when:${when}ms lag:${Date.now() - when}ms`;
    if (this.serverSocket.connected) {
      log.debug(str);
      this.serverSocket.emit('video', { id: this.id, faces: faces,
                                        frame: frame, contents: type, when: when });
    } else {
      log.warn(`dropped ${str}`);
    }
  }

  _command(cmd) {
    if (!this._ready) {
      log.warn(`camera service not ready, ignoring the command`);
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
   * Initialize camera and start sending camera data to the server
   */
  start(socket) {
    this.serverSocket = socket;
    this._init({
      frameInterval: DURATION,
      width: 1280,
      height: 720,
      fps: 25,
      vbr: 1024,
      previewScale: 4,
      previewSkipCount: 25
    });
  }

  /**
   * Stop the camera stream
   */
  stop() {
    // Ignore this command for now so that camera is still running and is
    // receiving the frames that could eventually be buffered and sent to the
    // server when server comes back online
    log.info(`command not supported`);
  }

  /**
   * Set flash mode as specified by flashMode parameter
   */
  flash(flashMode) {
    if (!FLASH_LIGHT_ENABLED) {
      log.warn(`flash light is not enabled`);
      return;
    }
    this._command({cmdName: 'flash', flashMode: flashMode});
  }
}

CameraStream.prototype.FLASH_MODE = FLASH_MODE;
module.exports = (id) => new CameraStream(id, BACK);
