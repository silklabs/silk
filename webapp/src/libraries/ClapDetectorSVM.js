import EventEmitter from 'events';
import svmjs from 'svm';

import createAudioAnalyzer from '../libraries/AudioAnalyzer';

export default class ClapDetectorSVM extends EventEmitter {
  analyzer;
  featureVector;
  featureVectorIndex;
  loudSoundStartTime;
  svm;
  track;

  constructor(track, cfg) {
    super();

    this.analyzer = createAudioAnalyzer({
      fftSize: cfg.fftSize,
      windowOverlap: cfg.windowOverlap,
      sampleRate: cfg.sampleRate,
      sampleMin: cfg.sampleMin,
      sampleMax: cfg.sampleMax,
    });
    this.cfg = cfg;
    this.featureVector = new Float32Array(cfg.featureVectorFrameCount *
                                          this.analyzer.frequencyBinCount);
    this.loudThreshold = cfg.loudThreshold;
    this.track = track;
    this.svm = new svmjs.SVM();
    this._reset();

    this.analyzer.on(cfg.fftType, this._onFFTMagnitude);
    this.track.on('timeupdate', this._onTimeUpdate);

    // TODO: model cache.  If only there were some sort of "modular"
    // way, or "module system", to load common bits of code just once,
    // and then cheaply load them them in many places elsewhere.
    fetch(cfg.model)
      .then((response) => response.json())
      .then((json) => this.svm.fromJSON(json));
  }

  destructor() {
    this.removeAllListeners();
    this.analyzer.removeListener(this.cfg.fftType, this._onFFTMagnitude);
    this.track.removeListener('timeupdate', this._onTimeUpdate);
  }

  _onFFTMagnitude = (magnitudes, startTime) => {
    if (!this._detectingLoudSound) {
      let isLoud = Math.max(...magnitudes) > this.cfg.loudThreshold;
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
    this._detectClap();
  };

  _onTimeUpdate = (currentTime, startTime, endTime, lastTime) => {
    let samples = this.track.getSamples(lastTime, currentTime);
    this.analyzer.appendSamples(samples, lastTime);
  };

  _detectClap() {
    let [ prediction ] = this.svm.predict([ this.featureVector ]);
    if (prediction === 1) {
      this.emit('clap', this.loudSoundStartTime);
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
