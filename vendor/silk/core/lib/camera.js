/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let log = require('./log')('camera');
import api from './api';
import { EventEmitter } from 'events';
let util = require('./util');
let net = require('net');

//const FRONT = 1;
const BACK = 0;

const DURATION_PROP = 'persist.silk.vidduration';
const DURATION = util.getintprop(DURATION_PROP, 1);

const UPLOAD_PROP = 'persist.silk.vidupload.enabled';
const UPLOAD_ENABLED = util.getboolprop(UPLOAD_PROP);
const FLASH_LIGHT_PROP = 'persist.silk.flash.enabled';
const FLASH_LIGHT_ENABLED = util.getboolprop(FLASH_LIGHT_PROP);

//Content type must be set to make clients happy later on.
const VIDEO_CONTENT_TYPE = 'video/mp4';

const VIDEO_BLOB_TYPE = 'video';

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
  add(when, frame, objects) {
    this.queue.push({
      when,
      frame,
      objects
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
    let { when, frame, objects } = item;
    let metadataPayload = {
      metaType: this.type,
      deviceId: this.id,
      startUTC: when,
      endUTC: when + this.duration,
      data: {
        frameWidth: PREVIEW_WIDTH,
        frameHeight: PREVIEW_HEIGHT,
        objects
      }
    };

    if (previousId) {
      metadataPayload.previousId = previousId;
    }

    // step 1 is to upload the data...
    return api.blob.upload(VIDEO_BLOB_TYPE, frame.length, VIDEO_CONTENT_TYPE, frame).then(blobUrl => {
      // step 2. upload the metadata...
      metadataPayload.url = blobUrl;
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
    if (!this.serverSocket.connected) {
      log.warn(`server socket not ready, not uploading`);
      return this.stop();
    }

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

  /** Update this's handle to the master server socket. */
  set socket(socket) {
    this.serverSocket = socket;
    this.start();
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
    this.videoUploads = new VideoUploadQueue(this.id, DURATION * 1000);

    // Keep track of all face packets we send and upload them along with the
    // metadata for video segments.
    this.videoObjects = [];

    // previewObjects is like videoObjects, but for the preview images
    this.previewObjects = [];
    this.previewHalFaces = false;
  }

  _restart(why) {
    if (!this._ready) {
      log.info(`camera restart pending (ignored "${why}")`);
      return;
    }
    log.info(`camera restart: ${why}`);
    this._ready = false;
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
        this._command({cmdName: 'init', cmdData: cmdData});
        this._command({cmdName: 'setParameter', name: 'focus-mode', value: 'continuous-video'});
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
          this.emit('preview', when, pkt);
          break;
        case TAG_VIDEO:
          this._pushVideo(when, pkt);
          break;
        case TAG_FACES:
          let faces = rawFaceArrayToFaces(pkt).map(normalizeFace);
          this.emit('face', faces);
          this._pushFace(when, faces);
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
    // Intentionally delay the preview image by one cycle (~1 second) to ensure
    // that the previewObjects are transmitted with their corresponding image.
    //
    // previewObjects are computed after the preview frame is received, so if
    // the preview frame is transmitted as quickly as possible and then a naïve
    // client will end up displaying the previewObjects for last frame.
    //
    // However the `when` timestamp is transmitted to the client for both the
    // preview image and objects so this little workaround can be removed in the
    // future if desired, once the appropriate client changes are made.
    //
    if (this.lastPreviewFrame) {
      this._pushPacket(this.lastPreviewFrameWhen, this.lastPreviewFrame, this.previewObjects, 'jpeg');
    }
    this.lastPreviewFrame = frame;
    this.lastPreviewFrameWhen = when;
    this.previewObjects = [];
    this.previewHalFaces = false;
  }

  _pushFace(when, faces) {
    let object = {tag: 'hal', when: when, rects: faces};

    // Only add the first set of HAL-detected faces to the preview object set
    // (the HAL can return multiple faces a second, but it's not helpful to show
    //  them all on the preview)
    if (!this.previewHalFaces) {
      this.previewHalFaces = true;
      this.previewObjects.push(object);
    }
    this.videoObjects.push(object);
  }

  _pushVideo(when, frame) {
    // For video we group all related face packets to make it easier on the
    // client.
    this._pushPacket(when, frame, this.videoObjects, 'mp4');
    if (UPLOAD_ENABLED) {
      this.videoUploads.add(when, frame, this.videoObjects);
    }
    this.videoObjects = [];
  }

  _pushPacket(when, frame, objects, type) {
    let str = `${type} size:${frame ? frame.length : 0} when:${when}ms lag:${Date.now() - when}ms`;
    if (this.serverSocket.connected) {
      log.verbose(str);
      this.serverSocket.emit('video', { id: this.id, objects: objects,
                                        frame: frame, contents: type, when: when });
    } else {
      log.verbose(`dropped ${str}`);
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
   * Initialize camera and start sending camera data to the server
   */
  start() {
    this.socket = { connected: false };
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
   * Provide the camera with a socket to use
   */
  set socket(socket) {
    this.serverSocket = socket;
    if (this.ready()) {
      // Force the last preview image to be transmitted immediately, to provide
      // the client with a preview image as quick as possible when the camera
      // first connects.
      this._pushPreview(null, null);
    }
    this.videoUploads.socket = socket;
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
   * Inject objects into the video stream.
   *
   * Each object in the provided array should contain the following fields:
   *   tag: object type (string)
   *   when: timestamp the object(s) manifested in the stream
   *   rects: one or more bounding rectangles for where the object appeared:
   *            {x, y, width, height}.
   *          The video preview image dimensions are used as the scale for
   *          these rectangles (PREVIEW_WIDTH x PREVIEW_HEIGHT)
   */
  addObjects(objects) {
    this.previewObjects.push(...objects);
    this.videoObjects.push(...objects);
  }

  /**
   * Inject an object into the video stream.
   *
   *   tag: object type (string)
   *   when: optional timestamp
   *   rect: optional rectangle
   *
   */
  addObject(tag, when, rect) {
    if (!when) {
      when = this.lastPreviewFrameWhen; // best guess
    }

    if (!rect) {
      const borderPad = 20;
      rect = {
        x: borderPad,
        y: borderPad,
        width: PREVIEW_WIDTH - borderPad * 2,
        height: PREVIEW_HEIGHT - borderPad * 2,
      };
    }

    this.addObjects([{
      tag: tag,
      when: when,
      rects: [rect]
    }]);
  }

  /**
   *
   */
  get previewSize() {
    return { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };
  }
}

CameraStream.prototype.FLASH_MODE = FLASH_MODE;
module.exports = (id) => new CameraStream(id, BACK);
