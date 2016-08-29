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
import wavDecoder from 'wav-decoder';
import { MelFeatureExtractor, Framer, Normalizer } from 'mel-features';
import removeSilence from '../lib/remove-silence';
import { default as createLog, configureLog } from 'silk-log';
configureLog('*');

const log = createLog('keyword_test');
let kws = null;

/**
 * Checks whether a path starts with or contains a hidden file or a folder
 *
 * @param {string} source - The path of the file that needs to be validated
 * returns {boolean} - `true` if the source is blacklisted and otherwise `false`
 */
let isHiddenPath = function (file) {
  return (/(^|\/)\.[^\/\.]/g).test(file);
};

async function processWav(wav) {
  let exists = await fs.exists(wav);
  if (!exists) {
    throw new Error(`${wav} not available`);
  }

  let fileData = await fs.readFile(wav);
  return wavDecoder.decode(fileData).then(audioData => {
    let rawData = audioData.channelData[0];
    let data = removeSilence(rawData);
    let sampleRate = audioData.sampleRate;
    let stepSize = kws.STEP_SIZE;
    let fftSize = kws.FFT_SIZE;
    let extractor = new MelFeatureExtractor(kws.MEL_COEFFS, sampleRate, fftSize);
    let normalizer = new Normalizer();
    let output = [];
    let framer = new Framer(stepSize, fftSize, signal => {
      assert(signal.length === fftSize);
      let features = extractor.process(signal);
      normalizer.track(features);
      output.push(features);
    });
    framer.addData(data);
    output.forEach(features => normalizer.apply(features, features));
    // Shorten samples that are too long
    if (output.length > kws.NUM_SAMPLES) {
      log.error(output.length, wav);
    }
    while (output.length > kws.NUM_SAMPLES) {
      output.shift();
      output.pop();
    }
    let padding = kws.NUM_SAMPLES - output.length;
    // Prepend padding
    for (let n = 0; n < padding / 2; ++n) {
      output.unshift(new Float32Array(kws.MEL_COEFFS));
    }
    // And append padding
    while (output.length < kws.NUM_SAMPLES) {
      output.push(new Float32Array(kws.MEL_COEFFS));
    }
    output = output.map(features => Array.prototype.slice.call(features));
    return output;
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
    let files = await fs.readdir(path.resolve(__dirname, 'samples'));

    for (let count = 0; count < files.length; count++) {
      log.info(`read file ${files[count]}`);
      if (isHiddenPath(files[count])) {
        continue;
      }

      try {
        let output = await processWav(path.join(__dirname, 'samples', files[count]));
        let [label, confidence] = await kws._predictAsync(output);
        log.info(`Result: label: \'${label}\' confidence: ${confidence}`);
        assert.equal(label, 'keyword', 'Keyword spotted');
      } catch (err) {
        log.error(`Error: ${err}`);
        assert(false, 'no error expected');
      }
    }
  });
});
