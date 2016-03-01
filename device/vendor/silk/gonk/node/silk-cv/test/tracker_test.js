'use strict';

const path = require('path');
const assert = require('assert');
const cv = require('opencv');
const silkcv = require('..');

suite('Tracker', () => {
  // TODO: Add 'CMT' tracker if/when it is made less crashy
  ['MEDIANFLOW'].forEach(trackerName => {
    test(trackerName, () => new Promise(resolve => {
      cv.readImage(path.join(__dirname, 'fixtures/tracker/t0.jpg'), (err, im) => {
        if (err) {
          throw err;
        }
        if (im.width() < 1 || im.height() < 1) {
          throw new Error('Input image has no size');
        }
        im.convertGrayscale();

        const tracker = new silkcv.Tracker(trackerName, im, {x:0, y:0, width:80, height:80},
          (err) => {
            console.log("New tracker initialized");
            assert(!tracker.busy(), 'Tracker not expected to be busy');
            cv.readImage(path.join(__dirname, 'fixtures/tracker/t1.jpg'), (err, im_test) => {
              if (err) {
                throw err;
              }
              if (im_test.width() < 1 || im_test.height() < 1) {
                throw new Error('Test image has no size');
              }
              im_test.convertGrayscale();
              console.log('here');
              let r = tracker.update(im_test, (err, found, rect) => {
                assert(!tracker.busy(), 'Tracker not expected to be busy');
                if (err) {
                  throw err;
                }
                console.log('patch rect', JSON.stringify(rect));
                assert(found, 'Target patch not found');
                assert(Math.abs(rect.x - 30) < 3, 'Unexpected x:' + Math.round(rect.x));
                assert(Math.abs(rect.y - 30) < 3, 'Unexepected y:' + Math.round(rect.y));
                assert(Math.abs(rect.width - 80) < 3, 'Unexpected width:' + Math.round(rect.width));
                assert(Math.abs(rect.height - 80) < 3, 'Unexepected height:' + Math.round(rect.height));

                im_test.save(path.join(__dirname, 'output.jpg'));
                resolve();
              });
            });
          }
        );
      });
    }));
  });
});
