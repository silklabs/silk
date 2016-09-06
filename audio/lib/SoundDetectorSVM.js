/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import EventEmitter from 'events';
import svmjs from 'svm';

import AudioAnalyzer from './AudioAnalyzer';
import FeatureVectorExtractor from './FeatureVectorExtractor';

import type { SvmSoundsConfig, SvmSoundsConfigs } from '..';

class SoundClassDetector {
  cfg: SvmSoundsConfig;
  events: ?EventEmitter;
  featureVectorExtractor: FeatureVectorExtractor;
  lastSonemeDetectTime: number;
  soundEventStartTime: number;
  svm: any;

  constructor(events: EventEmitter, analyzer: AudioAnalyzer, cfg: SvmSoundsConfig) {
    this.cfg = cfg;
    this.events = events;
    this.featureVectorExtractor = new FeatureVectorExtractor(analyzer, cfg);
    this.svm = new svmjs.SVM();

    this.featureVectorExtractor.on('loud-sound', this._onLoudSound);
    this.featureVectorExtractor.on('quiet', this._onQuiet);
    if (typeof cfg.model !== 'object') {
      throw new Error('SVM model must be a JSON object');
    }
    this.svm.fromJSON(cfg.model);
    this._reset();
  }

  destructor() {
    this.events = null;
    this.featureVectorExtractor.destructor();
  }

  _onLoudSound = (featureVector, startTime: number, endTime: number) => {
    let isSoneme = this._detectSoneme(featureVector);
    if (!isSoneme) {
      this._maybeEndSoundEvent(endTime);
      return;
    }
    this.lastSonemeDetectTime = endTime;
    if (!this._inSoundEvent) {
      this.soundEventStartTime = startTime;
      if (this.events) {
        this.events.emit('sound', {
          soundClass: this.cfg.soundClass,
          startTime: this.soundEventStartTime,
        });
      }
    }
  };

  _onQuiet = (endTime: number) => {
    this._maybeEndSoundEvent(endTime);
  };

  _maybeEndSoundEvent(endTime: number) {
    if (!this._inSoundEvent) {
      return;
    }
    if (endTime - this.lastSonemeDetectTime >= this.cfg.sonemeGapTimeout) {
      if (this.events) {
        this.events.emit('sound', {
          soundClass: this.cfg.soundClass,
          startTime: this.soundEventStartTime,
          endTime: this.lastSonemeDetectTime,
        });
      }
      this._reset();
    }
  }

  _detectSoneme(featureVector): boolean {
    let [ prediction ] = this.svm.predict([ featureVector ]);
    return prediction === 1;
  }

  _reset() {
    this.lastSonemeDetectTime = -1;
    this.soundEventStartTime = -1;
  }

  get _inSoundEvent(): boolean {
    return this.soundEventStartTime > 0;
  }
}

export default class SoundDetectorSVM extends EventEmitter {
  analyzer: AudioAnalyzer;
  detectors: Array<SoundClassDetector> = [];

  constructor(analyzer: AudioAnalyzer, cfgs: SvmSoundsConfigs) {
    super();

    this.analyzer = analyzer;
    this.detectors = Object.keys(cfgs)
      .map((key) => cfgs[key])
      .filter((cfg) => cfg.enabled)
      .map((cfg) => new SoundClassDetector(this, analyzer, cfg));
  }

  destructor() {
    this.detectors.forEach((detector) => detector.destructor());
    this.detectors = [ ];
    this.removeAllListeners();
  }

  appendSamples(samples: Float32Array, startTime: number) {
    this.analyzer.appendSamples(samples, startTime);
  }
}
