/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import assert from 'assert';
import createLog from 'silk-log';
import Env from 'silk-exttest';
import eventToPromise from 'event-to-promise';
import path from 'path';

const log = createLog('TestFramework');
const env = new Env('dnn');
const timeline = env.timeline;
const camera = env.camera;

let dnn = null;

function failOnTimeout(timeout) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject(`timeout`);
    }, timeout);
  });
}

async function addPreviewFrame(timestamp, image) {
  await camera.setPreviewFrame(timestamp,
      path.resolve(__dirname, 'files', image));
  process.nextTick(() => {
    timeline.emit('motion', timestamp);
  });
}

suite('test dnn', function () {
  test('setup', async () => {
    dnn = require('../lib/dnn')(env); // eslint-disable-line import/no-require

    log.info(`Waiting for dnn to be initialized`);
    await eventToPromise(dnn, 'ready');
    assert.notEqual(dnn, null);
  });

  test('dnn predict', async () => {
    let timestamp = Date.now();
    try {
      await addPreviewFrame(timestamp, path.resolve(__dirname, 'cat.jpg'));
      let [, , , name] = await Promise.race([
        eventToPromise(timeline, 'object', { array: true }),
        failOnTimeout(2000),
      ]);
      assert.equal(name, 'Cat', 'dnn category');
    } catch (err) {
      log.error(`Error: ${err}`);
      assert(false, 'no error expected');
    }
  });
});

