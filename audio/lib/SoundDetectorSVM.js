import { EventEmitter } from 'events';
import svmjs from 'svm';

import FeatureVectorExtractor from './FeatureVectorExtractor';

class SoundClassDetector {
  cfg;
  events;
  featureVectorExtractor;
  lastSonemeDetectTime;
  soundEventStartTime;
  svm;

  constructor(events, analyzer, cfg) {
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

  _onLoudSound = (featureVector, startTime, endTime) => {
    let isSoneme = this._detectSoneme(featureVector);
    if (!isSoneme) {
      this._maybeEndSoundEvent(endTime);
      return;
    }
    this.lastSonemeDetectTime = endTime;
    if (!this._inSoundEvent) {
      this.soundEventStartTime = startTime;
      this.events.emit('sound', {
        soundClass: this.cfg.soundClass,
        startTime: this.soundEventStartTime,
      });
    }
  };

  _onQuiet = (endTime) => {
    this._maybeEndSoundEvent(endTime);
  };

  _maybeEndSoundEvent(endTime) {
    if (!this._inSoundEvent) {
      return;
    }
    if (endTime - this.lastSonemeDetectTime >= this.cfg.sonemeGapTimeout) {
      this.events.emit('sound', {
        soundClass: this.cfg.soundClass,
        startTime: this.soundEventStartTime,
        endTime: this.lastSonemeDetectTime,
      });
      this._reset();
    }
  }

  _detectSoneme(featureVector) {
    let [ prediction ] = this.svm.predict([ featureVector ]);
    return prediction === 1;
  }

  _reset() {
    this.lastSonemeDetectTime = -1;
    this.soundEventStartTime = -1;
  }

  get _inSoundEvent() {
    return this.soundEventStartTime > 0;
  }
}

export default class SoundDetectorSVM extends EventEmitter {
  analyzer;
  detectors = [ ];

  constructor(analyzer, cfgs) {
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

  appendSamples(samples, startTime) {
    this.analyzer.appendSamples(samples, startTime);
  }
}
