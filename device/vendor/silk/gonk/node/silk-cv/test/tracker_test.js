'use strict';

const path = require('path');
const assert = require('assert');
const cv = require('opencv');
const silkcv = require('..');

suite('Tracker', () => {
  test('MEDIANFLOW', () => new Promise(resolve => {
    cv.readImage(path.join(__dirname, 'fixtures/tracker/t0.jpg'), (err, im) => {
      if (err) {
        throw err;
      }
      if (im.width() < 1 || im.height() < 1) {
        throw new Error('Input image has no size');
      }

      const tracker = new silkcv.Tracker("MEDIANFLOW", im, {x:0, y:0, width:80, height:80},
        (err) => {
          assert(!tracker.busy(), 'Tracker not expected to be busy');
          cv.readImage(path.join(__dirname, 'fixtures/tracker/t1.jpg'), (err, im_test) => {
            if (err) {
              throw err;
            }
            if (im_test.width() < 1 || im_test.height() < 1) {
              throw new Error('Test image has no size');
            }

            let r = tracker.update(im_test, (err, found, rect) => {
              assert(!tracker.busy(), 'Tracker not expected to be busy');
              if (err) {
                throw err;
              }
              console.log('patch rect', JSON.stringify(rect));
              assert(found, 'Target patch not found');
              assert(Math.round(rect.x) === 30, 'Unexpected x:' + Math.round(rect.x));
              assert(Math.round(rect.y) === 30, 'Unexepected y:' + Math.round(rect.y));
              assert(Math.round(rect.width) === 80, 'Unexpected width:' + Math.round(rect.width));
              assert(Math.round(rect.height) === 80, 'Unexepected height:' + Math.round(rect.height));

              im_test.save(path.join(__dirname, 'output.jpg'));
              resolve();
            });
          });
        }
      );
    });
  }));
});
