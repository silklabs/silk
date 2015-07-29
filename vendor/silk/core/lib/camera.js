/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let log = require('./log')('camera');
import api from 'silk-api';
import { getprop } from './util';
import { EventEmitter } from 'events';

//const FRONT = 1;
const BACK = 0;
const DURATION = 1;
const UPLOAD_PROP = 'persist.silk.vidupload.enabled';
const UPLOAD_ENABLED = getprop(UPLOAD_PROP) !== '';
// Content type must be set to make clients happy later on.
const VIDEO_CONTENT_TYPE = 'video/mp4';

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
  for (var i = 0; i < nrFaces; ++i) {
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


const HEADER_NR_BYTES = 16;
// See capture.cpp:46.
const TAG_VIDEO = 0;
const TAG_PREVIEW = 1;
const TAG_FACES = 2;

class VideoUploadQueue extends EventEmitter {
  /**
  @param {String} id device id.
  @param {Number} duration in milliseconds.
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

class CameraStream {
  constructor(id) {
    this.id = id;
    this.faces = [];
    this.helper = null;
    this.videoUploads = new VideoUploadQueue(this.id, DURATION * 1000);

    // Keep track of all face packets we send and upload them along with the
    // metadata for video segments.
    this.facePackets = [];
  }

  start(socket) {
    if (this.helper) {
      return;
    }
    var buffer;
    let launch = () => {
      let spawn = require('child_process').spawn;
      let helper = spawn('/system/bin/capture', [
        // Create i-frames every second, to send one-second video
        // chunks.
        '-i', DURATION,
        // Nominally 720p25 video at 1Mbps vbr.
        '-w', 1280, '-h', 720, '-f', 25, '-v', 1024,
        // Emit preview images at 320x180 (i.e. scale down HD720 by
        // a factor of 4) and emit them nominally 1 per second.
        '-p', 4, '-k', 25,
      ]);
      buffer = new Buffer(0);
      helper.stdout.on('data', data => {
        buffer = Buffer.concat([buffer, data]);
        while (buffer.length >= HEADER_NR_BYTES) {
          let size = buffer.readInt32LE(0);
          if (buffer.length < HEADER_NR_BYTES + size) {
            break;
          }
          let tag = buffer.readInt32LE(4);
          let sec = buffer.readInt32LE(8);   // timeval.tv_sec
          let usec = buffer.readInt32LE(12); // timeval.tv_usec
          let when = sec * 1000 + Math.round(usec / 1000); // UTC ms since epoch

          let pkt = buffer.slice(HEADER_NR_BYTES, HEADER_NR_BYTES + size);
          switch (tag) {
          case TAG_PREVIEW:
            this.pushPreview(when, pkt);
            break;
          case TAG_VIDEO:
            this.pushVideo(when, pkt);
            break;
          case TAG_FACES:
            this.faces = rawFaceArrayToFaces(pkt).map(normalizeFace);
            this.pushFace(when);
            break;
          default:
            break;
          }
          // put the rest of the buffer back
          let rest = new Buffer(buffer.length - (HEADER_NR_BYTES + size));
          buffer.copy(rest, 0, HEADER_NR_BYTES + size);
          buffer = rest;
        }
      });
      helper.on('close', () => {
        if (this.helper) {
          launch();
        }
      });
      this.helper = helper;
      this.socket = socket;
    };
    launch();
  }

  stop() {
    if (this.helper) {
      this.helper.kill();
      this.helper = null;
    }
  }

  pushPreview(when, frame) {
    this.pushPacket(when, frame, 'jpeg');
  }

  pushFace(when) {
    this.pushPacket(when, null, 'face');
    this.facePackets.push({ when, face: this.faces });
  }

  pushVideo(when, frame) {
    this.pushPacket(when, frame, 'mp4');
    if (UPLOAD_ENABLED) {
      this.videoUploads.add(when, frame, this.facePackets);
    }
    this.facePackets = [];
  }

  pushPacket(when, frame, type) {
    log.debug(`packet:${type}: size:${frame ? frame.length : 0} when:${when}ms lag:${Date.now() - when}ms`);
    this.socket.emit('video', { id: this.id, faces: this.faces,
                                frame: frame, contents: type, when: when });
  }
}

module.exports = (id) => new CameraStream(id, BACK);
