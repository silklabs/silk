/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

/*
Face Detection manual test.

Setup:
1. Load the following URL on a screen - https://goo.gl/QxRHQm
2. Run this script on device with the device pointing at the screen
    $ adb shell silk /system/node_modules/gonkcamera/fdtest.js
3. Monitor standard output for face detect information

If no faces are detected perform a sanity check that the Android camera preview
is able to detect a face in the same set up.
*/

var camera = require('./index');
var fs = require('fs');


var cam = new camera.Camera(0 /* back */);
cam.onFaceDetect(
  function (faces) {
    console.log("Face Detect - number of faces=" + faces.length + " face 1 details: " + faces[0]);
  }
);
cam.startPreview();

var min = 0;
var tick;
function tick() {
  console.log("Minute tick: " + min++);
  setTimeout(tick, 60 * 1000);
}
tick();
