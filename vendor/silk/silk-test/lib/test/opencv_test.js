/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let testFramework = require('../../../framework');
let assert = require('assert');
let eventToPromise = require('event-to-promise');

let log = testFramework.log;
let timeline = testFramework.timeline;
let camera = testFramework.camera;

suite('test opencv', () => {
  test('detect car', async function () {
    camera.setPreviewFrame('car1.jpg');

    let timestamp = Date.now();
    let rectsExp = [{'x': 26, 'y': 22, 'width': 253, 'height': 126}];
    let iters = 10;

    // Tests take a long time on emulator so increase the test level timeout
    // to give emulator a chance to finish all the iterations
    this.timeout(6000 * iters);

    for (let count = 1; count <= iters; count++) {
      log.info(`Running car detect test: ${count}/${iters}`);
      timeline.addPreviewFrame(timestamp);

      let [when, rects] = await eventToPromise(timeline, 'car');
      assert.equal(when, timestamp, 'car timestamp');
      assert.deepEqual(rects, rectsExp, 'car rects');
    }
  });
});
