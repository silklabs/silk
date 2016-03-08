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

export default class SoundDetectorSVM extends EventEmitter {
  analyzer;
  featureVector;
  featureVectorIndex;
  loudSoundStartTime;
  svm;

  constructor(analyzer, cfg) {
    super();

    this.analyzer = analyzer;
    this.cfg = cfg;
    this.featureVector = new Float32Array(cfg.featureVectorFrameCount *
                                          this.analyzer.frequencyBinCount);
    this.svm = new svmjs.SVM();
    this._reset();

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
    this.removeAllListeners();
    this.analyzer.removeListener(this.cfg.fftType, this._onFFTMagnitude);
  }

  appendSamples(samples, startTime) {
    this.analyzer.appendSamples(samples, startTime);
  }

  _onFFTMagnitude = (magnitudes, startTime) => {
    if (!this._detectingLoudSound) {
      let isLoud = max(magnitudes) > this.cfg.loudThreshold;
      if (!isLoud) {
        return;
      }
      this.loudSoundStartTime = startTime;
    }
    this.featureVector.set(magnitudes, this.featureVectorIndex);
    this.featureVectorIndex += this.analyzer.frequencyBinCount;
    if (!this._filledFeatureVector) {
      return;
    }
    this._detectSound();
  };

  _detectSound() {
    let [ prediction ] = this.svm.predict([ this.featureVector ]);
    if (prediction === 1) {
      this.emit(this.cfg.soundClass,
                this.cfg.soundClass, this.loudSoundStartTime);
    }
    this._reset();
  }

  _reset() {
    this.featureVectorIndex = 0;
    this.loudSoundStartTime = -1;
  }

  get _detectingLoudSound() {
    return this.featureVectorIndex > 0;
  }

  get _filledFeatureVector() {
    return this.featureVectorIndex === this.featureVector.length;
  }
}
