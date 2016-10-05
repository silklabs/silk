/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import invariant from 'assert';
import { createSoundDetectorSVM, parsePackedSVMModel, svmFFTConfig,
         svmSoundsConfigs } from 'silk-audio';
import fs from 'fs';
import path from 'path';
import createLog from 'silk-log/device';
import type {Env, Timeline} from 'silk-exttest';

import type { SoundDetectorSVM, SvmSoundsConfig } from 'silk-audio';
type MicData = {
  when: number;
  frames: Buffer;
};

const log = createLog('silkext-svmsounds');

const EVENT_PING_INTERVAL_MS = 500;
const MODEL_DIR = 'system/silk/media/svmsounds/model';

function loadModel(svmCfg: SvmSoundsConfig) {
  return new Promise((resolve, reject) => {
    if (typeof svmCfg.model !== 'string') {
      reject(new Error(`model name invalid`));
      return;
    }
    let modelPath = path.resolve(path.join(MODEL_DIR, svmCfg.model));
    log.info(`Reading model from ${modelPath}`);
    fs.readFile(modelPath, (err, model) => {
      if (err) {
        log.error(`Failed to read model: `, err);
        reject(err);
        return;
      }
      if (!svmCfg.enabled) {
        log.info(`Skipping loading model ${svmCfg.soundClass} as it is disabled`);
        resolve();
        return;
      }
      log.info(`Fetched model ${modelPath}; ${model.length} bytes`);

      // $FlowFixMe: Flow doesn't understand model.buffer
      let parsedModel = parsePackedSVMModel(model.buffer);
      if (!parsedModel) {
        reject(new Error('Failed to parse SVM model'));
        return;
      }
      svmCfg.model = parsedModel;
      resolve();
      return;
    });
  });
}

class SoundRecognizer {
  currentEvents: {[key: string]: {eventId: number, timeoutId: ?null}} = {};
  soundDetector: ?SoundDetectorSVM;
  timeline: Timeline;

  constructor(env: Env) {
    this.timeline = env.timeline;
    let cfgs = { };
    Object.assign(cfgs, svmSoundsConfigs);
    Promise.all(Object.keys(cfgs).map((key) => {
      let cfg = cfgs[key];
      return loadModel(cfg);
    }))
    .then(() => {
      log.info('Loaded all models, creating detector');
      this.soundDetector = createSoundDetectorSVM(svmFFTConfig, cfgs);
      if (!this.soundDetector) {
        throw new Error(`Failed to create sound detector`);
      }
      this.soundDetector.on('sound', this._onSoundEvent);
      env.camera.on('mic-data', this._onMicData);
    })
    .catch(err => log.error(err));
  }

  _onSoundEvent = (e) => {
    if (!e.endTime) {
      invariant(!(e.soundClass in this.currentEvents));

      let event = this.currentEvents[e.soundClass] = {
        eventId: this.timeline.getNextObjectId(),
        timeoutId: null,
      };
      // We emit the event ping to keep the event active within the
      // timeline tracker.
      let emitEventPing = () => {
        this.timeline.addObjects([{
          source: 'svmsounds',
          id: event.eventId,
          tag: 'sound',
          persist: true,
          name: e.soundClass,
          when: Math.round(1000 * e.startTime) || 0,
        }]);
        event.timeoutId = setTimeout(emitEventPing, EVENT_PING_INTERVAL_MS);
      };
      emitEventPing();
    } else {
      invariant(e.soundClass in this.currentEvents);

      let event = this.currentEvents[e.soundClass];
      clearTimeout(event.timeoutId);
      delete this.currentEvents[e.soundClass];
      this.timeline.addObjects([{
        source: 'svmsounds',
        id: event.eventId,
        tag: 'sound',
        name: e.soundClass,
        when: Math.round(1000 * e.startTime) || 0,
        durationMs: Math.round(1000 * (e.endTime - e.startTime)) || 0,
      }]);
    }
  };

  _onMicData = (msg: MicData) => {
    let time = msg.when / 1000;
    let rawSamples = msg.frames;
    // We're forced to do this slow manual copy because the node.js
    // Buffer API is broken.
    let samples = new Int16Array(rawSamples.length / 2);
    for (let i = 0; i < samples.length; ++i) {
      samples[i] = rawSamples.readInt16LE(2 * i);
    }
    this.soundDetector.appendSamples(samples, time);
  };
}

module.exports = (env: Env) => new SoundRecognizer(env);
