/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

/* global suite, test */

import KeywordSpotting from '..';
import assert from 'assert';
import eventToPromise from 'event-to-promise';
import path from 'path';
import fs from 'mz/fs';
import * as util from 'silk-sysutils';
import { default as createLog, configureLog } from 'silk-log';
configureLog('*');
import { configureSpeechToText } from 'silk-stt';
import * as speechOptions from 'silk-dialog-script/lib/speechAccessToken';
configureSpeechToText(speechOptions);

const audioFile = path.join(__dirname, 'long.wav');
const log = createLog('stream_test');
let kws = null;
let count = 0;
const TOTAL_COUNT = 3; // Total number of keyword utterances in the audioFile

/**
 * Read the file and stream the pcm data to kws. We are feeding kws wav header
 * too and expect kws to not qualify that as the keyword.
 */
async function processWav(wav) {
  let exists = await fs.exists(wav);
  if (!exists) {
    throw new Error(`${wav} not available`);
  }

  return new Promise((resolve, reject) => {
    let fileStream = fs.createReadStream(wav);
    fileStream.on('data', (chunk) => {
      kws.addMicData({ when: Date.now(), frames: chunk });
    });
    fileStream.on('error', (err) => {
      reject(err);
    });
    fileStream.on('end', () => {
      log.info(`Finished adding mic data`);
      resolve();
    });
  });
}

/**
 * Count how many times keyword is uttered
 * @returns
 */
function countKeywords() {
  kws.on('keyword', () => {
    count++;
  });
}

suite('test keyword spotting', function () {
  test('setup', async () => {
    kws = new KeywordSpotting(null, true);
    log.info(`Waiting for kws to be initialized`);
    await eventToPromise(kws, 'ready');
    assert.notEqual(kws, null);
  });

  test('keyword spotting', async () => {
    try {
      kws.start();
      countKeywords();
      await processWav(audioFile);
      await util.timeout(5000);

      // Make sure there are exactly TOTAL_COUNT utterances
      log.info(`Total keywords spotted: ${count}`);
      assert.equal(count, TOTAL_COUNT, 'keyword count');
    } catch (err) {
      log.error(`Error: ${err}`);
      assert(false, 'no error expected');
    }
  });
});
