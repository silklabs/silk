/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import assert from 'assert';
import createLog from 'log';
import eventToPromise from 'event-to-promise';
import path from 'path';
import Framework from 'silk-sdk-glue/src/framework';

const log = createLog('TestFramework');
const env = new Framework('trackobject');
const timeline = env.timeline;
const camera = env.camera;

let trackObject = null;

function failOnTimeout(timeout) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject();
    }, timeout);
  });
}

function addPreviewFrame(image, timestamp) {
  camera.setPreviewFrame(path.resolve(__dirname, 'files', image));
  timeline.emit('preview', timestamp);
}

suite('test trackobject', function () {
  test('detect motion', async () => {
    trackObject = require('../lib/trackobject')(env);
    assert.notEqual(trackObject, null);
  });

  test('detect motion', async () => {
    log.info(`Running motion test`);

    let timestamp = Date.now();
    process.nextTick(() => addPreviewFrame('motion_1.png', timestamp));

    timestamp = Date.now();
    process.nextTick(() => addPreviewFrame('motion_2.png', timestamp));

    timestamp = Date.now();
    process.nextTick(() => addPreviewFrame('motion_3.png', timestamp));

    try {
      log.info(`Waiting for motion event`);
      let [when, rects] = await Promise.race([eventToPromise(timeline, 'motion'),
                          failOnTimeout(1000)]);
      log.info(`Received motion at ${when} rects: ${JSON.stringify(rects)}`);
      assert.equal(when, timestamp, 'motion timestamp');
      assert.notEqual(rects, null);
    } catch (err) {
      assert.ok(false, `error: ${JSON.stringify(err)}`);
    }
  });
});
