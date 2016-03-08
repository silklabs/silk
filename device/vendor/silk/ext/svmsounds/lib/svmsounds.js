/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import config from 'silk-config';
import { createSoundDetectorSVM } from 'silk-audio';
import fs from 'fs';
import path from 'path';

// Must match training configuration in webapp/.  TODO: better
// solution.
let clapSVMConfig = {
  soundClass: 'clap',
  model: 'system/silk/media/svmsounds/model/clap-svm.json',
  fftType: 'fftMagnitudeLinear',
  loudThreshold: 0.01,
  fftSize: 512,
  windowOverlap: 256,
  featureVectorFrameCount: 16,
  sampleRate: config.deviceMic.sampleRate,
  sampleMin: config.deviceMic.sampleMin,
  sampleMax: config.deviceMic.sampleMax
};

let log;

class SoundRecognizer {
  clapDetector;

  constructor(env) {
    log = env.log;

    let modelPath = path.resolve(clapSVMConfig.model);
    log.info(`Reading model from ${modelPath}`);
    fs.readFile(modelPath, 'utf8', (err, data) => {
      if (err) {
        log.error(`Failed to read model: ${err}`);
        return;
      }
      log.info('Fetched model, creating detector');
      clapSVMConfig.model = JSON.parse(data);
      this.clapDetector = createSoundDetectorSVM(clapSVMConfig);

      this.clapDetector.on('clap', this._onClap);
      env.camera.on('mic-data', this._onMicData);
    });
  }

  _onClap = (startTime) => {
    log.info(`clap at ${startTime}`);
    // TODO: add to timeline
  };

  _onMicData = (msg) => {
    let time = msg.when / 1000;
    let rawSamples = msg.frames;
    let samples = new Int16Array(rawSamples.length / 2);
    for (let i = 0; i < samples.length; ++i) {
      samples[i] = rawSamples.readInt16LE(2 * i);
    }
    this.clapDetector.appendSamples(samples, time);
  };
}

module.exports = (env) => new SoundRecognizer(env);
