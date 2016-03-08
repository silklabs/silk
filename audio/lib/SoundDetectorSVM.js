import createLog from 'silk-log';
import { EventEmitter } from 'events';
import svmjs from 'svm';

const log = createLog('audio-SoundDetectorSVM');

/**
 * Return the value of the maximum element of `array`.
 *
 * A naive grasshopper might be tempted to write something like
 * `Math.max(...array)`, but that would be foolish indeed.  Something
 * pathological in the spread-operator translation causes that
 * expression to run ~200x slower than this loop on device.
 */
function max(array) {
  let maxValue = -Infinity;
  for (let i = 0; i < array.length; ++i) {
    maxValue = Math.max(array[i], maxValue);
  }
  return maxValue;
}

class SoundClassDetector {
  analyzer;
  cfg;
  emittedStartEvent = false;
  events;
  featureVector;
  featureVectorIndex = 0;
  lastDetectEndTime = -1;
  soundEventStartTime = -1;
  svm;

  constructor(events, analyzer, cfg) {
    this.analyzer = analyzer;
    this.cfg = cfg;
    this.events = events;
    this.featureVector = new Float32Array(cfg.featureVectorFrameCount *
                                          this.analyzer.frequencyBinCount);
    this.svm = new svmjs.SVM();
    this._resetSoundEvent();

    this.analyzer.on(cfg.fftType, this._onFFTMagnitude);
    if (typeof cfg.model === 'object') {
      this.svm.fromJSON(cfg.model);  
    } else {
      fetch(cfg.model)
        .then((response) => response.json())
        .then((json) => {
          this.svm.fromJSON(json);
        })
        .catch((err) =>
               log.error(`Failed to fetch model ${cfg.model}: ${err}`));
    }
  }

  destructor() {
    this.events = null;
    this.analyzer.removeListener(this.cfg.fftType, this._onFFTMagnitude);
  }

  _onFFTMagnitude = (magnitudes, startTime, endTime) => {
    if (!this._detectingLoudSound) {
      let isLoud = max(magnitudes) > this.cfg.loudThreshold;
      if (!isLoud) {
        if (this._inSoundEvent) {
          this._maybeExpireGapTimer(endTime);
        }
        return;
      }
      if (!this._inSoundEvent) {
        this.soundEventStartTime = startTime;
      }
    }
    this.featureVector.set(magnitudes, this.featureVectorIndex);
    this.featureVectorIndex += this.analyzer.frequencyBinCount;
    if (!this._filledFeatureVector) {
      return;
    }
    this._detectSound(endTime);
  };

  _detectSound(endTime) {
    let [ prediction ] = this.svm.predict([ this.featureVector ]);
    if (prediction === 1) {
      if (!this.emittedStartEvent) {
        this.events.emit('sound', {
          soundClass: this.cfg.soundClass,
          startTime: this.soundEventStartTime
        });
        this.emittedStartEvent = true;
      }
      this.lastDetectEndTime = endTime;
    }        
    this.featureVectorIndex = 0;
    this._maybeExpireGapTimer(endTime);
  }

  _maybeExpireGapTimer(endTime) {
    if (this._inSoundEvent) {
      if (endTime - this.lastDetectEndTime < this.cfg.maxGapTime) {
        // Still have time remaining to detect another event.
        return;
      }
      // Time's up ... declare this event to be over.
      this.events.emit('sound', {
        soundClass: this.cfg.soundClass,
        startTime: this.soundEventStartTime,
        endTime: this.lastDetectEndTime
      });
    }
    this._resetSoundEvent();
  }

  _resetSoundEvent() {
    this.emittedStartEvent = false;
    this.lastDetectEndTime = -1;
    this.soundEventStartTime = -1;
  }

  get _detectingLoudSound() {
    return this.featureVectorIndex > 0;
  }

  get _filledFeatureVector() {
    return this.featureVectorIndex === this.featureVector.length;
  }

  get _inSoundEvent() {
    return this.lastDetectEndTime > 0;
  }
}

export default class SoundDetectorSVM extends EventEmitter {
  analyzer;
  detectors = [ ];

  constructor(analyzer, cfgs) {
    super();

    this.analyzer = analyzer;
    this.detectors = Object.keys(cfgs).map((key) => {
      let cfg = cfgs[key];
      return new SoundClassDetector(this, analyzer, cfg);
    });
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
