'use strict';

const log = require('silk-log')('main');
const Camera = require('silk-camera').default;
const path = require('path');

const FACE_CASCADE = path.join(__dirname, 'haarcascade_frontalface_alt.xml');

require('./device').init();

let camera = new Camera();
camera.init()
.then(() => {
  log.info('camera initialized');
  camera.startRecording();
}).catch(e => {
  log.info('Error: ' + e);
});

let busy = false;
camera.on('frame', (when, image) => {
  if (busy) {
    // If the previous haar cascade is still running, skip this frame
    return;
  }
  if (image.width() < 1 || image.height() < 1) {
    throw new Error('Image has no size');
  }

  busy = true;
  image.detectObject(FACE_CASCADE, {}, (err, faces) => {
    busy = false;

    if (err) throw err;
    if (faces.length === 0) {
      log.info('No faces detected');
    } else {
      log.info(faces.length + ' faces detected');
      for (let i = 0; i < faces.length; i++) {
        const face = faces[i];
        image.ellipse(face.x + face.width / 2, face.y + face.height / 2, face.width / 2, face.height / 2);
      }
      const filename = '/data/face_' + Date.now() + '.png';
      image.save(filename);
      log.info('Saved ' + filename);
    }
  });
});
