/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import assert from 'assert';
import createLog from 'silk-log';
import Framework from 'silk-exttest';
import eventToPromise from 'event-to-promise';
import path from 'path';
import fs from 'fs';
import wavDecoder from 'wav-decoder';
import { MelFeatureExtractor, Framer, Normalizer } from 'mel-features';
import removeSilence from './remove-silence';

const log = createLog('TestFramework');
const env = new Framework('kws');
const timeline = env.timeline;

let kws = null;

function failOnTimeout(timeout) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject(`timeout`);
    }, timeout);
  });
}

async function processWav(wav) {
  let exists = fs.existsSync(wav);
  if (!exists) {
    throw new Error(`${wav} not available`);
  }

  let fileData = fs.readFileSync(wav);
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
    // shorten samples that are too long
    if (output.length > kws.NUM_SAMPLES) {
      log.error(output.length, wav);
    }
    while (output.length > kws.NUM_SAMPLES) {
      output.shift();
      output.pop();
    }
    let padding = kws.NUM_SAMPLES - output.length;
    // prepend padding
    for (let n = 0; n < padding / 2; ++n) {
      output.unshift(new Float32Array(kws.MEL_COEFFS));
    }
    // and append padding
    while (output.length < kws.NUM_SAMPLES) {
      output.push(new Float32Array(kws.MEL_COEFFS));
    }
    output = output.map(features => Array.prototype.slice.call(features));
    return output;
  });
}

suite('test keyword spotting', function () {
  test('setup', async () => {
    kws = require('../lib/kws')(env, true); // eslint-disable-line import/no-require
    log.info(`Waiting for kws to be initialized`);
    await eventToPromise(kws, 'ready');
    assert.notEqual(kws, null);
  });

  test('keyword spotting', async () => {
    try {
      let data = await processWav(path.resolve(__dirname, 'pando.wav'));
      log.info(`length: ${data.length}`);
      kws._predictAsync(data);
      let [, , , name] = await Promise.race([
        eventToPromise(timeline, 'keyword', { array: true }),
        failOnTimeout(2000),
      ]);
      assert.equal(name, 'keyword', 'Keyword spotted');
    } catch (err) {
      log.error(`Error: ${err}`);
      assert(false, 'no error expected');
    }
  });
});
