/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import assert from 'assert';
import createLog from 'silk-log';
import eventToPromise from 'event-to-promise';
import path from 'path';
import Env from 'silk-exttest';

const log = createLog('TestFramework');
const env = new Env('motion');
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

suite('test motion', function () {
  test('detect motion', async () => {
    motionObject = require('../lib/motion')(env); // eslint-disable-line import/no-require
    assert.notEqual(motionObject, null);
  });

  test('detect motion', async () => {
    log.info(`Running motion test`);

    camera.startPlayback(path.resolve(__dirname, 'files'));

    try {
      log.info(`Waiting for motion event`);
      let [when, rects] = await Promise.race([eventToPromise(timeline, 'motion', { array: true }),
                          failOnTimeout(1000)]);
      log.info(`Received motion at ${when} rects: ${JSON.stringify(rects)}`);
      assert.notEqual(rects, null);
    } catch (err) {
      assert.ok(false, `error: ${JSON.stringify(err)}`);
    }
    camera.stopPlayback();
  });
});
