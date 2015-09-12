/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

let testFramework = require('../../framework')('opencv_test');
let assert = require('assert');
let fs = require('mz/fs');

let log = testFramework.log;
let timeline = testFramework.timeline;
let camera = testFramework.camera;

function waitForEvent(event, timeout) {
  return new Promise((resolve, reject) => {
    let timeInterval = setTimeout(() => {
      timeline.removeAllListeners(event);
      reject(`event ${event} not received within ${timeout / 1000}secs`);
    }, timeout);
    timeline.once(event, (time, rects) => {
      clearTimeout(timeInterval);
      resolve([time, rects]);
    });
  });
}

suite('test opencv', function () {
  // Tests take a long time on emulator so increase the test level timeout
  // to give emulator a chance to finish all the iterations
  this.timeout(600000);

  test('find similar cars', async function () {
    let dirPath = testFramework.rootDir + '/files/cars';
    let files = await fs.readdir(dirPath);
    let rectsExp = [{'x': 124, 'y': 31, 'width': 157, 'height': 78}];

    // Motion detection requires at least two images to run so load it with two
    // images before starting the test
    try {
      camera.setPreviewFrame(`cars/${files[0]}`);
      process.nextTick(() => timeline.addPreviewFrame(Date.now()));
      await waitForEvent('no-motion', 10000);
      process.nextTick(() => timeline.addPreviewFrame(Date.now()));
      await waitForEvent('no-motion', 10000);

      // Force detectobject to find the new car object
      process.nextTick(() => timeline.emit('motion', null));
      await waitForEvent('car', 10000);
    } catch (err) {
      log.error(`Error: ${err}`);
      assert(false);
    }

    let addPreviewFrame = function(timestamp) {
      timeline.addPreviewFrame(timestamp);
    };

    for (let count = 0; count < files.length; count++) {
      log.info(`read file ${files[count]}`);

      camera.setPreviewFrame(`cars/${files[count]}`);
      let timestamp = Date.now();
      process.nextTick(addPreviewFrame.bind(this, timestamp));

      try {
        let [when, rects] = await waitForEvent('car', 10000);
        log.info(`when: ${when} rects: ${JSON.stringify(rects)}`);
        assert.equal(when, timestamp, 'car timestamp');
        assert.deepEqual(rects, rectsExp, 'car rects');
      } catch (err) {
        log.error(`Error: ${err}`);
        assert(false, 'no error expected');
      }
    }
  });
  test('detect car', async () => {
    camera.setPreviewFrame('car1.jpg');

    let rectsExp = [{'x': 30, 'y': 27, 'width': 240, 'height': 120}];
    let iters = 10;

    for (let count = 1; count <= iters; count++) {
      log.info(`Running car detect test: ${count}/${iters}`);
      let timestamp = Date.now();
      timeline.emit('motion', timestamp);

      try {
        let [when, rects] = await waitForEvent('car', 10000);
        log.info(`when: ${when} rects: ${JSON.stringify(rects)}`);
        assert.equal(when, timestamp, 'car timestamp');
        assert.deepEqual(rects, rectsExp, 'car rects');
      } catch (err) {
        log.error(`Error: ${err}`);
        assert(false, 'no error expected');
      }
    }
  });
});
