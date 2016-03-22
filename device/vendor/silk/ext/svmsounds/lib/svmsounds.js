/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
import invariant from 'assert';
import { createSoundDetectorSVM,
         svmFFTConfig, svmSoundsConfigs } from 'silk-audio';
import fs from 'fs';
import path from 'path';

let log;

const EVENT_PING_INTERVAL_MS = 500;
const MODEL_DIR = 'system/silk/media/svmsounds/model';

function loadModel(svmCfg) {
  return new Promise((resolve, reject) => {
    let modelPath = path.resolve(path.join(MODEL_DIR, svmCfg.model));
    log.info(`Reading model from ${modelPath}`);
    fs.readFile(modelPath, 'utf8', (err, data) => {
      if (err) {
        log.error(`Failed to read model: ${err}`);
        return reject(err);
      }
      log.info(`Fetched model ${modelPath}`);
      svmCfg.model = JSON.parse(data);
      return resolve();
    });
  });
}

class SoundRecognizer {
  currentEvents = { };          // string -> { eventId, timerId }
  soundDetector;
  timeline;

  constructor(env) {
    log = env.log;

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
        this.soundDetector.on('sound', this._onSoundEvent);
        env.camera.on('mic-data', this._onMicData);
      });
  }

  _onSoundEvent = (e) => {
    if (!e.endTime) {
      invariant(!(e.soundClass in this.currentEvents));

      let event = this.currentEvents[e.soundClass] = {
        eventId: this.timeline.getNextObjectId(),
        timeoutId: null,
      };
      let emitEventPing = () => {
        this.timeline.addObjects([{
          id: event.eventId,
          tag: 'sound',
          name: e.soundClass,
          when: Math.round(1000 * e.startTime) || 0
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
        id: event.eventId,
        tag: 'sound',
        name: e.soundClass,
        when: Math.round(1000 * e.startTime) || 0,
        durationMs: Math.round(1000 * (e.endTime - e.startTime)) || 0,
      }]);
    }
  };

  _onMicData = (msg) => {
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

module.exports = (env) => new SoundRecognizer(env);
