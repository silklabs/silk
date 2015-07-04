/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let util = require('./util');

const NAME = (util.getprop('persist.silk.displayName')
              || 'Silkcam');

//const FRONT = 1;
const BACK = 0;

// TODO: Remove old preview code once face detect is added to new JPEG code
const JPEG_PREVIEW = true;

/**
 * Return the object `{ id, x, y, width, height }` representing the
 * `camera_face_t face` rectangle mapped into mako screen space IN THE
 * ORIENTATION WHERE FRONT CAMERA IS BOTTOM RIGHT FACING YOU.
 */
function normalizeFace(face) {
  // These params are defined by the long comment just below the
  // declaration of `struct camera_face` in
  // system/core/include/system/camera.h.
  let [id, left, top, right, bottom ] = face;
  //
  // On mako, the values reported are as follows, WHEN THE
  // FRONT-FACING CAMERA IS HELD SO THAT IT'S ON THE BOTTOM-RIGHT OF
  // THE SCREEN FROM YOUR PERSPECTIVE.  That is, when you're looking
  // at the phone like so:
  //
  //  +------------------+
  //  |  a            b  |
  //  |O                 |
  //  |  c            d o| <--- front-facing camera
  //  +------------------+
  //
  // The left-right axis is reported as you would expect: the `left`
  // coord is minimum when your face is on the left, and 'right' is
  // maximum when your face is on the right.
  //
  // The top-bottom axis is inverted, however: `top` is minimum when
  // your face is at the bottom of the screen, and `bottom` is maximum
  // when your face is at the top of the screen.
  //
  // More concretely, when your face shows up at the points above,
  // coords are approximately (assuming your face is 100x100 pixels):
  //
  //  a: (left: -1000,  top:   900,  right: -900,  bottom: 1000)
  //  b: (left:   900,  top:   900,  right: 1000,  bottom: 1000)
  //  c: (left: -1000,  top: -1000,  right: -900,  bottom: -900)
  //  d: (left:   900,  top: -1000,  right: 1000,  bottom: -900)
  //
  // So we translate coords first into the camera-in-bottom-right
  // abstract space by a y flip.
  [ top, bottom ] = [ -bottom, -top ];
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
  return {
    id: id,
    x: normCoord(left, WIDTH), y: normCoord(top, HEIGHT),
    width: normLen(right - left, WIDTH), height: normLen(bottom - top, HEIGHT),
    fieldWidth: WIDTH, fieldHeight: HEIGHT,
  };
}

var CameraStream;

if (JPEG_PREVIEW) {
  class JpegCameraStream {
    constructor(id) {
      this.id = id;
      this.helper = null;
    }

    start(socket) {
      if (this.helper) {
        return;
      }
      var buffer;
      let launch = () => {
        let spawn = require('child_process').spawn;
        let helper = spawn('/system/bin/capture', []);
        buffer = new Buffer(0);
        helper.stdout.on('data', data => {
          buffer = Buffer.concat([buffer, data]);
          while (buffer.length >= 8) {
            let size = buffer.readInt32LE(0);
            let hdr = buffer.readInt32LE(4);
            if (buffer.length < 8 + size) {
              break;
            }
            let pkt = buffer.slice(8, 8 + size);
            if (hdr === 1) {
              //(hdr === 1) ? 'preview' : 'video',
              this.pushPacket(pkt);
            }
            // put the rest of the buffer back
            let rest = new Buffer(buffer.length - (8 + size));
            buffer.copy(rest, 0, 8 + size);
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

    pushPacket(jpeg) {
      this.socket.emit('video', { id: this.id, name: NAME, frame: jpeg,
                                  contents: 'jpeg', });
    }
  }
  CameraStream = JpegCameraStream;
} else {
  let camera = require('gonkcamera');

  class OldCameraStream {
    constructor(id, whichCamera) {
      this.id = id;
      this.cam = new camera.Camera(whichCamera);
      this.faces = [];
      this.cam.onFaceDetect(fa => {
        this.faces = fa.map(normalizeFace);
        this.pushPacket(null);
      });
      this.cam.onPreviewFrame(yuv420sp => this.pushPacket(yuv420sp));
    }

    start(socket) {
      this.cam.startPreview();
      this.socket = socket;
    }

    stop() {
      this.cam.stopPreview();
      this.socket = null;
    }

    pushPacket(buf) {
      this.socket.emit('video', { id: this.id, name: NAME,
                                  // TODO: get this from bindings
                                  width: 320, height: 240,
                                  frame: buf, faces: this.faces });
    }
  }
  CameraStream = OldCameraStream;
}

module.exports = (id) => new CameraStream(id, BACK);
