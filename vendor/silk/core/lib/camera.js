/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let util = require('./util');

const NAME = (util.getprop('persist.silk.displayName')
              || 'Silkcam');

//const FRONT = 1;
const BACK = 0;

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

class CameraStream {
  constructor(id) {
    this.id = id;
    this.faces = [];
    this.helper = null;
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
        '-i', 1,
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
          let sec = buffer.readInt32LE(8);
          let msec = Math.round(buffer.readInt32LE(12) / 1e6);
          let when = sec + (msec / 1000);

          let pkt = buffer.slice(HEADER_NR_BYTES, HEADER_NR_BYTES + size);
          switch (tag) {
          case TAG_PREVIEW:
            this.pushPacket(when, pkt, 'jpeg');
            break;
          case TAG_VIDEO:
            this.pushPacket(when, pkt, 'mp4');
            break;
          case TAG_FACES:
            this.faces = rawFaceArrayToFaces(pkt).map(normalizeFace);
            this.pushPacket(when);
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

  pushPacket(when, frame, type) {
    this.socket.emit('video', { id: this.id, name: NAME, faces: this.faces,
                                frame: frame, contents: type, when: when });
  }
}

module.exports = (id) => new CameraStream(id, BACK);
