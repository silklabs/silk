/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import assert from 'assert';
import createLog from 'log';
import eventToPromise from 'event-to-promise';
import path from 'path';
import fs from 'mz/fs';
import Framework from 'silk-exttest';
import opencv from 'opencv';

const log = createLog('TestFramework');
const env = new Framework('detectcar', opencv);
const timeline = env.timeline;
const camera = env.camera;
const cascade = '../../../../external/node-opencv/data/hogcascade_cars_sideview.xml';

let detectCar = null;

function failOnTimeout(timeout) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject();
    }, timeout);
  });
}

function addPreviewFrame(image, timestamp) {
  process.nextTick(() => {
    camera.setPreviewFrame(path.resolve(__dirname, 'files', image));
    timeline.emit('motion', timestamp);
  });
}

suite('test opencv', () => {
  test('init detectcar', async () => {
    detectCar = require('../lib/detectcar')(env, cascade);
    assert.notEqual(detectCar, null);
  });

  test('detect all cars', async () => {
    let files = await fs.readdir(path.resolve(__dirname, 'files'));

    for (let count = 0; count < files.length; count++) {
      log.info(`read file ${files[count]}`);
      addPreviewFrame(files[count], Date.now());

      try {
        let [when, rects] = await Promise.race([
          eventToPromise(timeline, 'car'),
          failOnTimeout(10000),
        ]);
        log.info(`when: ${when} rects: ${JSON.stringify(rects)}`);
        assert.notEqual(rects, null);
      } catch (err) {
        log.error(`Error: ${err}`);
        assert(false, 'no error expected');
      }
    }
  });
  test('detect car consistently', async () => {
    camera.setPreviewFrame(path.resolve(__dirname, 'files', 'car_1.png'));

    let rectsExp = [{'x': 123, 'y': 30, 'width': 163, 'height': 82}];
    let iters = 10;

    for (let count = 1; count <= iters; count++) {
      log.info(`Running car detect test: ${count}/${iters}`);
      let timestamp = Date.now();
      timeline.emit('motion', timestamp);

      try {
        let [when, rects] = await Promise.race([
          eventToPromise(timeline, 'car'),
          failOnTimeout(10000),
        ]);
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
