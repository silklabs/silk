import invariant from 'assert';
import React from 'react';

import createAudioAnalyzer from '../libraries/AudioAnalyzer';
import Scrubber from './Scrubber';

// We assume 16-bit signed samples from the mic stream.
//
// TODO: get me from global audio config
const SAMPLE_MIN = -32768;
const SAMPLE_MAX = 32767;

// The "real" maximum loudness we see on the linear scale is ~0.1, but
// that's a very very loud sound.  So we intentonally clip the max
// here to get a better-colorized graph.
const LINEAR_SCALE = { min: 0, max: 0.05 };
const DECIBEL_SCALE = { min: -80, max: -20 };

const ColorModels = {
  hsv: {
    r: {
      L: 1, M: 0, R: 1,
      lm: 1 / 5, m1: 1 / 3,
      m2: 2 / 3, mr: 85 / 100,
    },
    g: {
      L: 0, M: 1, R: 0,
      lm: 0, m1: 1 / 5,
      m2: 1 / 2, mr: 2 / 3,
    },
    b: {
      L: 0, M: 1, R: 0,
      lm: 1 / 3, m1: 1 / 2,
      m2: 85 / 100, mr: 1,
    },
  },
  jet: {
    r: {
      L: 0, M: 1, R: 0,
      lm: 3 / 8, m1: 5 / 8,
      m2: 7 / 8, mr: 9 / 8,
    },
    g: {
      L: 0, M: 1, R: 0,
      lm: 1 / 8, m1: 3 / 8,
      m2: 5 / 8, mr: 7 / 8,
    },
    b: {
      L: 0, M: 1, R: 0,
      lm: -1 / 8, m1: 1 / 8,
      m2: 3 / 8, mr: 5 / 8,
    },
  },
  grayscale: {
    r: {
      L: 1, M: 0, R: 0,
      lm: 0, m1: 1.0, m2: 1.0, mr: 1.0,
    },
    g: {
      L: 1, M: 0, R: 0,
      lm: 0, m1: 1.0, m2: 1.0, mr: 1.0,
    },
    b: {
      L: 1, M: 0, R: 0,
      lm: 0, m1: 1.0, m2: 1.0, mr: 1.0,
    },
  },
};

let computeColor = (I, model) => {
  let { L, M, R, lm, m1, m2, mr } = model;
  if (I < lm) {
    return L;
  }
  if (lm <= I && I <= m1) {
    return L + (M - L) * (I - lm) / (m1 - lm);
  }
  if (m1 < I && I < m2) {
    return M;
  }
  if (m2 <= I && I <= mr) {
    return M + (R - M) * (I - m2) / (mr - m2);
  }
  if (mr < I) {
    return R;
  }
  throw `Intensity ${I} should have been mapped`;
};

let cssColor = (I, model) => {
  I = Math.min(Math.max(I, 0), 1.0);
  let r = (255 * computeColor(I, model.r)) | 0;
  let g = (255 * computeColor(I, model.g)) | 0;
  let b = (255 * computeColor(I, model.b)) | 0;
  return `rgb(${r},${g},${b})`;
};

class Spectrogram {
  // Stored in order of oldest to newest.
  values = [ ];

  constructor(nrFrames, nrMagnitudes) {
    for (let i = 0; i < nrFrames; ++i) {
      this.values.push(new Float32Array(nrMagnitudes));
    }
  }

  accumulate(magnitudes) {
    let next = this.values.shift();
    invariant(next.length === magnitudes.length);
    next.set(magnitudes);
    this.values.push(next);
  }

  get latest() {
    return this.values[this.length - 1];
  }

  get length() {
    return this.values.length;
  }
}

export default class AudioVisualizer extends React.Component {
  state = {
    currentTime: 0,
    startTime: 0,
    endTime: 0,
    playing: false,
  };

  analyzer = null;
  ctx = null;
  spectrogramLinear = null;
  spectrogramDecibel = null;
  tempCanvas = null;
  tempCtx = null;
  track = null;
  windowStart = 0;
  windowEnd = 0;

  componentWillMount() {
    this._attachTrack(this.props.track);
  }

  componentDidMount() {
    this.analyzer = createAudioAnalyzer({
      fftSize: this.props.fftSize,
      windowOverlap: this.props.windowOverlap,
      sampleRate: this.props.track.sampleRate,
      sampleMin: SAMPLE_MIN,
      sampleMax: SAMPLE_MAX,
    });
    this.analyzer.on('timeDomain', this._onTimeDomain);
    this.analyzer.on('fftMagnitudeLinear', this._onFFTMagnitudeLinear);
    this.analyzer.on('fftMagnitudeDecibel', this._onFFTMagnitudeDecibel);
    this.ctx = this.refs.canvas.getContext('2d');
    this.spectrogramLinear = new Spectrogram(this.props.spectrogramFrames,
                                             this.analyzer.frequencyBinCount);
    this.spectrogramDecibel = new Spectrogram(this.props.spectrogramFrames,
                                              this.analyzer.frequencyBinCount);
    this.tempCanvas = document.createElement('canvas');
    this.tempCanvas.width = this.props.graphWidth;
    this.tempCanvas.height = this.props.graphHeight;
    this.tempCtx = this.tempCanvas.getContext('2d');
  }

  componentWillReceiveProps(newProps) {
    this._attachTrack(newProps.track);
    if (this.props.drawGrid !== newProps.drawGrid) {
      this._clearGraph();
    }
  }

  componentWillUnmount() {
    this._attachTrack(null);
    this.analyzer.removeAllListeners();
    this.analyzer = null;
  }

  get _colorModel() {
    return ColorModels[this.props.colorModel] || ColorModels.jet;
  }

  get _nyquistFrequency() {
    return this.track.sampleRate / 2;
  }

  _attachTrack(track) {
    if (this.track === track) {
      return;
    }
    if (this.track) {
      this.track.stop();
      this.track.removeListener('timeupdate', this._onTimeUpdate);
      this.track.removeListener('playing', this._onTimeUpdate);
      this.track.removeListener('ended', this._onTimeUpdate);
    }
    if (track) {
      track.on('timeupdate', this._onTimeUpdate);
      track.on('playing', this._onPlaying);
      track.on('ended', this._onEnded);
      track.play();
    }
    this.track = track;
    this._reset();
  }

  _clearGraph() {
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.refs.canvas.width, this.refs.canvas.height);
    }
    if (this.tempCtx) {
      this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
    }
  }

  _computeFreqParams(scaleType) {
    let maxFreq = this._nyquistFrequency;
    let hzPerBin = maxFreq / this.analyzer.frequencyBinCount;
    let { max, min } = scaleType;
    let scale = 1.0 / (max - min);
    return { min, max, scale, hzPerBin, maxFreq };
  }

  _drawFFTMagnitudes(scaleType, magnitudes) {
    let freqBins = this.analyzer.frequencyBinCount;
    let binWidth = this.props.graphWidth / freqBins;
    let spacer = this.props.drawGrid ? 1 : 0;
    let { min, scale, hzPerBin, maxFreq } = this._computeFreqParams(scaleType);
    this._drawInCartesianCoords((ctx, width, height) => {
      ctx.fillStyle = 'blue';
      for (let i = 0; i < freqBins; ++i) {
        let mag = scale * (magnitudes[i] - min);
        ctx.fillRect(i * binWidth, 0, binWidth - spacer, height * mag);
      }
      if (!this.props.drawGrid) {
        return;
      }
      ctx.fillStyle = 'black';
      for (let hz = 500; hz <= maxFreq; hz += 500) {
        let bin = (hz / hzPerBin) | 0;
        let x = bin * binWidth + 1;
        ctx.fillRect(x, 0, 1, 10);
      }
    });
  }

  _drawSpectrogram(scaleType, spect) {
    // Preserve already-drawn frames: it's too expensive to redraw all
    // of them on each new FFT.
    let frameWidth = this.props.graphWidth / this.props.spectrogramFrames;
    let binHeight = this.props.graphHeight / this.analyzer.frequencyBinCount;
    let spacer = this.props.drawGrid ? 1 : 0;
    this._copyTranslated(-frameWidth, 0);
    let { min, scale, hzPerBin, maxFreq } = this._computeFreqParams(scaleType);
    this._drawInCartesianCoords((ctx, width, height, canvas) => {
      let mags = spect.latest;
      let i = spect.length - 1;
      for (let freqBin = 0; freqBin < mags.length; ++freqBin) {
        let mag = scale * (mags[freqBin] - min);
        ctx.fillStyle = cssColor(mag, this._colorModel);
        ctx.fillRect(i * frameWidth, freqBin * binHeight,
                     frameWidth - spacer, binHeight);
      }
      if (!this.props.drawGrid) {
        return;
      }
      ctx.fillStyle = 'white';
      for (let hz = 0; hz <= maxFreq; hz += 500) {
        let bin = (hz / hzPerBin) | 0;
        let y = bin * binHeight;
        ctx.fillRect(0, y, width, 1);
      }
    }, false);
  }

  _onPlaying = () => {
    this.setState({ playing: true });
  };

  _onEnded = () => {
    this.setState({ playing: false });
  };

  _onTimeUpdate = (currentTime, startTime, endTime) => {
    this._seek(currentTime, startTime, endTime);
  };

  _onFFTMagnitudeLinear = (magnitudes, startTime, endTime) => {
    this.spectrogramLinear.accumulate(magnitudes);
    if (this.props.onFFTMagnitudeLinear) {
      this.props.onFFTMagnitudeLinear(magnitudes, startTime, endTime);
    }
    switch (this.props.graphView) {
    case 'freqLinear':
      this._drawFFTMagnitudes(LINEAR_SCALE, magnitudes);
      return;
    case 'spectLinear':
      this._drawSpectrogram(LINEAR_SCALE, this.spectrogramLinear);
      return;
    default:
      return;
    }
  };

  _onFFTMagnitudeDecibel = (magnitudes, startTime, endTime) => {
    this.spectrogramDecibel.accumulate(magnitudes);
    if (this.props.onFFTMagnitudeDecibel) {
      this.props.onFFTMagnitudeDecibel(magnitudes, startTime, endTime);
    }
    switch (this.props.graphView) {
    case 'freqDecibel':
      this._drawFFTMagnitudes(DECIBEL_SCALE, magnitudes);
      return;
    case 'spectDecibel':
      this._drawSpectrogram(DECIBEL_SCALE, this.spectrogramDecibel);
      return;
    default:
      return;
    }
  };

  _onTimeDomain = (data) => {
    if (this.props.graphView !== 'time') {
      return;
    }
    let pointSize = this.props.graphWidth / data.length;
    this._drawInCartesianCoords((ctx, width, height) => {
      ctx.fillStyle = 'black';
      ctx.fillRect(0, height / 2, width, 1);
      ctx.fillStyle = 'blue';
      for (let i = 0; i < data.length; ++i) {
        let norm = (1.0 + data[i]) / 2.0;
        ctx.fillRect(i * pointSize, height * norm, pointSize, pointSize);
      }
    });
  };

  _onTabSelect = (key) => {
    this.setState({ graphView: key });
  };

  _copyTranslated(dx, dy) {
    let [ canvas, ctx ] = [ this.refs.canvas, this.ctx ];
    let [ width, height ] = [ canvas.width, canvas.height ];
    let [ tempCanvas, tempCtx ] = [ this.tempCanvas, this.tempCtx ];
    tempCtx.drawImage(canvas, 0, 0, width, height);
    ctx.save();
    ctx.translate(dx, dy);
    ctx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, width, height);
    ctx.restore();
  }

  _drawInCartesianCoords(drawFunc, clear = true) {
    let [ canvas, ctx ] = [ this.refs.canvas, this.ctx ];
    let [ width, height ] = [ canvas.width, canvas.height ];
    ctx.save();

    if (clear) {
      ctx.clearRect(0, 0, width, height);
    }
    ctx.translate(0, height);
    ctx.scale(1, -1);
    drawFunc(ctx, width, height, canvas);

    ctx.restore();
  }

  _onScrub = (value) => {
    this._seek(value, this.state.startTime, this.state.endTime);
  };

  _seek(currentTime, startTime, endTime) {
    let [ lastStart, lastEnd ] = [ this.windowStart, this.windowEnd ];
    this.windowEnd = currentTime;
    this.windowStart = Math.max(0.0, currentTime - this._windowDuration);
    let fetchStart, fetchEnd;
    if (lastStart <= this.windowStart && this.windowStart < lastEnd
        && lastEnd < this.windowEnd) {
      // Fast path: we're playing back forwards in time, so we can
      // preserve content already in the display by just shifting it
      // (analyzer handles this).
      [ fetchStart, fetchEnd ] = [ lastEnd, this.windowEnd ];
    } else {
      // Drat, we give up.  Fetch the entire window.
      [ fetchStart, fetchEnd ] = [ this.windowStart, this.windowEnd ];
      this._reset();
    }
    let newSamples = this.track.getSamples(fetchStart, fetchEnd);
    this.analyzer.appendSamples(newSamples, fetchStart);
    this.setState({ currentTime, startTime, endTime });
  }

  _reset() {
    this._clearGraph();
    if (this.analyzer) {
      this.analyzer.reset();
    }
  }

  get _windowDuration() {
    return (this.props.fftSize - this.props.windowOverlap) * this.props.spectrogramFrames / this.track.sampleRate;
  }

  render() {
    let width = this.props.graphWidth;
    let height = this.props.graphHeight;
    return (
      <div>
        <canvas ref="canvas" width={width} height={height} />
        <Scrubber
          disabled={this.state.playing}
          width={width}
          pos={this.state.currentTime}
          start={this.state.startTime}
          end={this.state.endTime}
          onScrub={this._onScrub}
        />
      </div>
    );
  }
}
