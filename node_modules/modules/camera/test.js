/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

var camera = require('./index');
var fs = require('fs');
var spawn = require('child_process').spawn;

//
// Manual record test
//
function runRecord(cameraId, seconds)
{
  var cam = new camera.Camera(cameraId);
  cam.onFaceDetect(
    function (faces) {
      console.log("Face Detect - number of faces=" + faces.length + " face 1 details: " + faces[0]);
    }
  );
  var recorder = spawn('/system/bin/screenrecord', ['--output', 'mp2ts', '-' ]);
  cam.startPreview();

  var writable = fs.createWriteStream('/data/v.ts');
  recorder.stdout.pipe(writable);

  setTimeout(function() {
    console.log("Timeout, stopping recording");
    recorder.kill();
    cam.stopPreview();
  }, seconds * 1000);
}

// Uncomment to run the front camera for 10 seconds.
//runRecord(1, 10);

//
// Manual preview test
//
function runPreview(cameraId, seconds)
{
  var cam = new camera.Camera(cameraId);
  cam.onPreviewFrame(
    function () {
      console.log("Frame.");
    }
  )
  cam.onFaceDetect(
    function (faces) {
      console.log("Face Detect - number of faces=" + faces.length + " face 1 details: " + faces[0]);
    }
  );
  cam.startPreview();

  setTimeout(function() {
    console.log("Timeout, stopping preview");
    cam.stopPreview();
  }, seconds * 1000);
}

// Uncomment to run the front camera for 10 seconds.
//runPreview(1, 10);
// Uncomment to run the back camera for 10 seconds.
//runPreview(0, 10);

exports['cameraInfo'] = function(test) {
  // Ensure that getCameraInfo() return some data
  var numCameras = camera.getCameraInfo().length;
  test.expect(numCameras);
  var cameraList = camera.getCameraInfo();
  for (var i = 0; i < numCameras; i++) {
    console.log(i + ': facing=' + cameraList[i].facing +
                     ' orientation=' + cameraList[i].orientation);
    test.ok(true);
  }
  test.done();
}

exports['cameraParameters'] = function(test) {
  // Ensure that getParameters() return some data
  var numCameras = camera.getCameraInfo().length;
  test.expect(numCameras)
  for (var i = 0; i < numCameras; i++) {
    var cam = new camera.Camera(i);
    console.log('Camera ' + i + ' parameters:');
    console.log(cam.getParameters());
    cam.disconnect();
    test.ok(true);
  }
  test.done();
}

exports['cameraPreviewStartStop'] = function(test) {
  // Ensure that camera preview can be started/stopped for all cameras
  var numCameras = camera.getCameraInfo().length;
  test.expect(numCameras);
  for (var i = 0; i < numCameras; i++) {
    var cam = new camera.Camera(i);
    console.log('Camera ' + i + ' start preview');
    cam.startPreview();
    console.log('Camera ' + i + ' stop preview');
    cam.stopPreview();
    cam.disconnect();
    test.ok(true);
  }
  test.done();
}

exports['cameraPreviewFrameCount'] = function(test) {
  // Ensure that frame callbacks are being generated during camera preview
  var numFrames = 5
  test.expect(numFrames);

  var cam = new camera.Camera(0);
  cam.onPreviewFrame(
    function (buf) {
      console.log("Frame.");
      console.log("Frame; length", buf.length);
      test.ok(true);

      numFrames = numFrames - 1;
      if (numFrames <= 0) {
        cam.onPreviewFrame(undefined);
        cam.stopPreview();
        cam.disconnect();
        test.done();
      }
    }
  )
  cam.startPreview();
}

exports['cameraFaceDetect'] = function(test) {
  test.expect(1);

  var cam = new camera.Camera(0);
  cam.onFaceDetect(
    function (faces) {
      console.log("Face Detected - number of faces=" + faces.length + " face 1 details: " + faces[0]);
      test.ok(true);
      cam.onFaceDetect(undefined);
      cam.stopPreview();
      cam.disconnect();
      test.done();
    }
  )
  cam.startPreview();
  console.log("Waiting for a face to appear on the back camera...");
}


exports['cameraPreviewSanity'] = function(test) {
  var TOTALFRAMES = 300;
  test.expect(TOTALFRAMES);

  var cam = new camera.Camera(0);
  var frame = 0;
  cam.onPreviewFrame(
    function () {
      console.log("Frame #" + ++frame + " of " + TOTALFRAMES);
      test.ok(true);
      if (frame == TOTALFRAMES) {
        cam.onPreviewFrame(undefined);
        cam.stopPreview();
        cam.disconnect();
        test.done();
      }
    }
  )
  cam.startPreview();
}

