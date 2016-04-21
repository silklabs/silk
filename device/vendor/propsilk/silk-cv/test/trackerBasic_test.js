'use strict';

const path = require('path');
const assert = require('assert');
const cv = require('opencv');
const silkcv = require('..');

function readImage(filename: string): Promise<Matrix> {
  return new Promise((resolve, reject) => {
    cv.readImage(filename, (err, im) => {
      if (err) {
        reject(err);
      } else {
        resolve(im);
      }
    });
  });
}

function trackerUpdate(tracker: any, image: any): Promise<[found, rect]> {
  return new Promise((resolve, reject) => {
    tracker.update(image, (err, found, rect) => {
      if (err) {
        reject(err);
      } else {
        resolve([found, rect]);
      }
    });
  });
}

suite('Tracker', () => {
  let image_t0;
  let image_t1;

  setup(async () => {
    image_t0 = await readImage(path.join(__dirname, 'fixtures/tracker/t0.jpg'));
    image_t1 = await readImage(path.join(__dirname, 'fixtures/tracker/t1.jpg'));
    [image_t0, image_t1].forEach(im => {
      if (im.width() < 1 || im.height() < 1) {
        throw new Error('Input image has no size');
      }
      im.convertGrayscale();
    });
  });

  ['DLIB', 'CMT'].forEach(trackerClass => {
    test(trackerClass + ' sanity',
      async () => await new Promise(
        (resolve, reject) => {
          const tracker = new silkcv.Tracker(
            trackerClass,
            image_t0,
            {x:0, y:0, width:80, height:80},
            async (err) => {
              console.log("New tracker initialized");

              for (let i = 0; i < 10; i++) {
                try {
                  console.log('Loop', i);
                  assert(!tracker.busy(), 'Tracker not expected to be busy');
                  let [found, rect] = await trackerUpdate(tracker, image_t1);
                  assert(!tracker.busy(), 'Tracker not expected to be busy');
                  console.log(trackerClass, 'patch rect', JSON.stringify(rect));
                  assert(found, 'Target patch not found');
                  assert(Math.abs(rect.x - 30) < 3, 'Unexpected x:' + Math.round(rect.x));
                  assert(Math.abs(rect.y - 30) < 3, 'Unexepected y:' + Math.round(rect.y));
                  assert(Math.abs(rect.width - 80) < 3, 'Unexpected width:' + Math.round(rect.width));
                  assert(Math.abs(rect.height - 80) < 3, 'Unexepected height:' + Math.round(rect.height));
                } catch (err) {
                  console.log('Error', err.stack || err);
                  reject(err);
                }
              }

              resolve();
            }
          );
        }
      )
    );

    test(trackerClass + ' cancel',
      async () => await new Promise(resolve => {
        const tracker = new silkcv.Tracker(
          trackerClass,
          image_t0,
          {x:0, y:0, width:80, height:80},
          err => {
            assert(!err, 'Tracker init error: ' + err);
            tracker.update(
              image_t1,
              (err, found, rect) => assert(false, 'Tracker not cancelled')
            );
            assert(tracker.busy(), 'Tracker should be busy');
            tracker.cancel();
            assert(tracker.busy(), 'Tracker should still be busy');
            setTimeout(resolve, 250);
          }
        );
      })
    );
  });
});
