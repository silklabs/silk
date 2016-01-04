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
import Framework from 'silk-sdk-glue/src/framework';

const log = createLog('TestFramework');
const env = new Framework('detectcat');
const timeline = env.timeline;
const camera = env.camera;

let detectCat = null;
const cascade = path.resolve(__dirname, '../cascade/lbpcascade_cat.xml');
log.info(`cascade file ${cascade}`);

/**
 * Checks whether a path starts with or contains a hidden file or a folder
 *
 * @param {string} source - The path of the file that needs to be validated
 * returns {boolean} - `true` if the source is blacklisted and otherwise `false`
 */
let isHiddenPath = function (file) {
  return (/(^|\/)\.[^\/\.]/g).test(file);
};

function failOnTimeout(timeout) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject(`timeout`);
    }, timeout);
  });
}

function addPreviewFrame(image, timestamp) {
  process.nextTick(() => {
    camera.setPreviewFrame(path.resolve(__dirname, 'files', image));
    timeline.emit('motion', timestamp);
  });
}

suite('test detectcat', function () {
  test('test detect cat init', async () => {
    detectCat = require('../lib/detectcat')(env, cascade);
    assert.notEqual(detectCat, null);
  });

  test('detect all cats', async () => {
    let files = await fs.readdir(path.resolve(__dirname, 'files'));

    for (let count = 0; count < files.length; count++) {
      log.info(`read file ${files[count]}`);
      if (isHiddenPath(files[count])) {
        continue;
      }

      let timestamp = Date.now();
      addPreviewFrame(files[count], timestamp);

      try {
        let [when, rects] = await Promise.race([
          eventToPromise(timeline, 'cat'),
          failOnTimeout(1000),
        ]);
        log.info(`when: ${when} rects: ${JSON.stringify(rects)}`);
        assert.notEqual(rects, null);
      } catch (err) {
        log.error(`Error: ${err}`);
        assert(false, 'no error expected');
      }
    }
  });
});
