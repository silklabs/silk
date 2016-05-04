/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import assert from 'assert';
import createLog from 'silk-log';
import eventToPromise from 'event-to-promise';
import path from 'path';
import Framework from 'silk-exttest';

const log = createLog('TestFramework');
const env = new Framework('motion');
const timeline = env.timeline;
const camera = env.camera;

let motionObject = null;

function failOnTimeout(timeout) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject();
    }, timeout);
  });
}

async function addPreviewFrame(timestamp, image) {
  await camera.setPreviewFrame(timestamp, path.resolve(__dirname, 'files', image));
  timeline.emit('preview', timestamp);
}

suite('test motion', function () {
  test('detect motion', async () => {
    motionObject = require('../lib/motion')(env);
    assert.notEqual(motionObject, null);
  });

  test('detect motion', async () => {
    log.info(`Running motion test`);

    let timestamp = Date.now();
    process.nextTick(() => addPreviewFrame(timestamp, 'motion_1.png'));

    timestamp = Date.now();
    process.nextTick(() => addPreviewFrame(timestamp, 'motion_2.png'));

    timestamp = Date.now();
    process.nextTick(() => addPreviewFrame(timestamp, 'motion_3.png'));

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
