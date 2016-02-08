'use strict';

const path = require('path');
const assert = require('assert');
const cv = require('opencv');
const Cmt = require('..').Cmt;

cv.readImage(path.join(__dirname, 'input.jpg'), (err, im) => {
  if (err) throw err;
  if (im.width() < 1 || im.height() < 1) throw new Error('Input image has no size');
  im.convertGrayscale();

  let cmtInitOptions = {
    drawPoints: true,
  };
  const cmt = Cmt(im, {x:0, y:0, width:140, height:170},
    (err) => {
      console.log('Cmt ready');
      assert(!cmt.busy());
      cv.readImage(path.join(__dirname, 'test.jpg'), (err, im_test) => {
        if (err) throw err;
        if (im.width() < 1 || im.height() < 1) throw new Error('Test image has no size');
        im_test.convertGrayscale();
        let r = cmt.nextFrame(im_test, (err, result) => {
          assert(!cmt.busy());
          if (err) throw err;
          console.log('nextFrame results', JSON.stringify(err), JSON.stringify(result));
          const r = result.boundingRect
          console.log('boundingRect', JSON.stringify(r));

          im_test.save(path.join(__dirname, 'output.jpg'));
        });
        assert(cmt.busy());
      });
    }, cmtInitOptions
  );
  assert(cmt.busy());
});
