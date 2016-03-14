'use strict';

const path = require('path');
const assert = require('assert');
const cv = require('opencv');
const silkcv = require('..');


function faceTest(imageFile, numFacesExpected) {
  return new Promise(
    resolve => {
      cv.readImage(
        path.join(__dirname, 'fixtures/faceDetector/' + imageFile),
        (err, im) => {
          if (err) {
            throw err;
          }
          if (im.width() < 1 || im.height() < 1) {
            throw new Error('Input image has no size');
          }
          im.convertGrayscale();

          let faceDetector = new silkcv.FaceDetector(
            err => {
              assert(!err, 'FaceDetector init error: ' + err);
              faceDetector.detect(
                im,
                (err, faces) => {
                  assert(!err, 'FaceDetector detect error: ' + err);
                  console.log('Faces:', JSON.stringify(faces));
                  assert(faces.length === numFacesExpected,
                    'Expecting ' + numFacesExpected + ', got ' + faces.length);
                  resolve();
                }
              );
              assert(faceDetector.busy(), 'FaceDetector should be busy');
            }
          );
        }
      );
    }
  );
}

suite('FaceDetector', () => {
  test('1face', () => faceTest('1face.jpg', 1));
  test('2faces', () => faceTest('2faces.jpg', 2));
  test('5faces', () => faceTest('5faces.jpg', 5));

  test('init cancel',
    () => new Promise(
      resolve => {
        let faceDetector = new silkcv.FaceDetector(
          err => assert(false, 'FaceDetector not cancelled')
        );
        assert(faceDetector.busy(), 'FaceDetector should be busy');
        faceDetector.cancel();
        assert(faceDetector.busy(), 'FaceDetector should still be busy');
        setTimeout(resolve, 500);
      }
    )
  );

  test('detect cancel',
    () => new Promise(
      resolve => {
        let faceDetector = new silkcv.FaceDetector(
          err => {
            let im = new cv.Matrix();
            faceDetector.detect(im, err => assert(false, 'FaceDetector not cancelled'));
            assert(faceDetector.busy(), 'FaceDetector should be busy');
            faceDetector.cancel();
            assert(faceDetector.busy(), 'FaceDetector should still be busy');
            setTimeout(resolve, 500);
          }
        );
      }
    )
  );
});
