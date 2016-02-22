import invariant from 'assert';
import React from 'react';
import { Tabs, Tab } from 'react-bootstrap';

import createAudioAnalyzer from '../libraries/AudioAnalyzer';

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
    graphView: 'spectLinear',
  };

  analyzer = null;
  canvas = {
    time: {
      canvas: null,
      ctx: null,
    },
    freqLinear: {
      canvas: null,
      ctx: null,
      scale: LINEAR_SCALE,
    },
    freqDecibel: {
      canvas: null,
      ctx: null,
      scale: DECIBEL_SCALE,
    },
    spectLinear: {
      canvas: null,
      ctx: null,
      scale: LINEAR_SCALE,
    },
    spectDecibel: {
      canvas: null,
      ctx: null,
      scale: DECIBEL_SCALE,
    },
    temp: {
      canvas: null,
      ctx: null,
    },
  };
  spectrogramLinear = null;
  spectrogramDecibel = null;
  track = null;

  componentDidMount() {
    this.analyzer = createAudioAnalyzer({
      fftSize: this.props.fftSize,
      windowOverlap: this.props.windowOverlap,
      sampleMin: SAMPLE_MIN,
      sampleMax: SAMPLE_MAX,
    });
    this.analyzer.on('timeDomain', this._onTimeDomain);
    this.analyzer.on('fftMagnitudeLinear', this._onFFTMagnitudeLinear);
    this.analyzer.on('fftMagnitudeDecibel', this._onFFTMagnitudeDecibel);
    for (let canvasRef in this.canvas) {
      let canvas = this.refs[canvasRef];
      if (!canvas) {
        console.log(`Creating offscreen canvas ${canvasRef}`);
        canvas = document.createElement('canvas');
        canvas.width = this.props.graphWidth;
        canvas.height = this.props.graphHeight;
      }
      this.canvas[canvasRef].canvas = canvas;
      this.canvas[canvasRef].ctx = canvas.getContext('2d');
    }
    this.spectrogramLinear = new Spectrogram(this.props.spectrogramFrames,
                                             this.analyzer.frequencyBinCount);
    this.spectrogramDecibel = new Spectrogram(this.props.spectrogramFrames,
                                              this.analyzer.frequencyBinCount);
    this._attachTrack(this.props.track);
  }

  componentWillReceiveProps(newProps) {
    if (this.track === newProps.track) {
      return;
    }
    this._attachTrack(newProps.track);
  }

  componentWillUnmount() {
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
    if (this.track) {
      this.track.stop();
      this.track.removeListener('progress', this._onProgress);
    }
    this._clearAllGraphs();
    track.on('progress', this._onProgress);
    track.play();
    this.track = track;
  }

  _clearAllGraphs() {
    for (let canvasRef in this.canvas) {
      let { canvas, ctx } = this.canvas[canvasRef];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  _computeFreqParams(graph) {
    let maxFreq = this._nyquistFrequency;
    let hzPerBin = maxFreq / this.analyzer.frequencyBinCount;
    let { max, min } = graph.scale;
    let scale = 1.0 / (max - min);
    return { min, max, scale, hzPerBin, maxFreq };
  }

  _drawFFTMagnitudes(graph, magnitudes) {
    let freqBins = this.analyzer.frequencyBinCount;
    let binWidth = this.props.graphWidth / freqBins;
    let { min, scale, hzPerBin, maxFreq } = this._computeFreqParams(graph);
    this._drawInCartesianCoords(graph, (ctx, width, height) => {
      ctx.fillStyle = 'blue';
      for (let i = 0; i < freqBins; ++i) {
        let mag = scale * (magnitudes[i] - min);
        ctx.fillRect(i * binWidth, 0, binWidth - 1, height * mag);
      }
      ctx.fillStyle = 'black';
      for (let hz = 500; hz <= maxFreq; hz += 500) {
        let bin = (hz / hzPerBin) | 0;
        let x = bin * binWidth + 1;
        ctx.fillRect(x, 0, 1, 10);
      }
    });
  }

  _drawSpectrogram(graph, spect) {
    // Preserve already-drawn frames: it's too expensive to redraw all
    // of them on each new FFT.
    let frameWidth = this.props.graphWidth / this.props.spectrogramFrames;
    let binHeight = this.props.graphHeight / this.analyzer.frequencyBinCount;
    this._copyTranslated(graph, -frameWidth, 0);

    let { min, scale, hzPerBin, maxFreq } = this._computeFreqParams(graph);
    this._drawInCartesianCoords(graph, (ctx, width, height, canvas) => {
      let mags = spect.latest;
      let i = spect.length - 1;
      for (let freqBin = 0; freqBin < mags.length; ++freqBin) {
        let mag = scale * (mags[freqBin] - min);
        ctx.fillStyle = cssColor(mag, this._colorModel);
        ctx.fillRect(i * frameWidth, freqBin * binHeight,
                     frameWidth - 1, binHeight);
      }
      ctx.fillStyle = 'white';
      for (let hz = 0; hz <= maxFreq; hz += 500) {
        let bin = (hz / hzPerBin) | 0;
        let y = bin * binHeight;
        ctx.fillRect(0, y, width, 1);
      }
    }, false);
  }

  _onProgress = (samples, currentTime) => {
    this.analyzer.appendSamples(samples);
  };

  _onFFTMagnitudeLinear = (magnitudes) => {
    this.spectrogramLinear.accumulate(magnitudes);
    switch (this.state.graphView) {
    case 'freqLinear':
      this._drawFFTMagnitudes(this.canvas.freqLinear, magnitudes);
      return;
    case 'spectLinear':
      this._drawSpectrogram(this.canvas.spectLinear, this.spectrogramLinear);
      return;
    default:
      return;
    }
  };

  _onFFTMagnitudeDecibel = (magnitudes) => {
    this.spectrogramDecibel.accumulate(magnitudes);
    switch (this.state.graphView) {
    case 'freqDecibel':
      this._drawFFTMagnitudes(this.canvas.freqDecibel, magnitudes);
      return;
    case 'spectDecibel':
      this._drawSpectrogram(this.canvas.spectDecibel, this.spectrogramDecibel);
      return;
    default:
      return;
    }
  };

  _onTimeDomain = (data) => {
    if (this.state.graphView !== 'time') {
      return;
    }
    let pointSize = this.props.graphWidth / data.length;
    this._drawInCartesianCoords(this.canvas.time, (ctx, width, height) => {
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

  _copyTranslated(graph, dx, dy) {
    let { canvas, ctx } = graph;
    let [ width, height ] = [ canvas.width, canvas.height ];
    let tempCanvas = this.canvas.temp.canvas;
    let tempCtx = this.canvas.temp.ctx;
    tempCtx.drawImage(canvas, 0, 0, width, height);
    ctx.save();
    ctx.translate(dx, dy);
    ctx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, width, height);
    ctx.restore();
  }

  _drawInCartesianCoords(canvasAndCtx, drawFunc, clear = true) {
    let { canvas, ctx } = canvasAndCtx;
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

  render() {
    let width = this.props.graphWidth;
    let height = this.props.graphHeight;
    return (
      <div>
        <Tabs position="left"
          activeKey={this.state.graphView}
          onSelect={this._onTabSelect}>
          <Tab eventKey={'spectLinear'} title="Spectrogram (Linear)">
            <canvas ref="spectLinear" width={width} height={height} />
          </Tab>
          <Tab eventKey={'spectDecibel'} title="Spectrogram (Decibel)">
            <canvas ref="spectDecibel" width={width} height={height} />
          </Tab>
          <Tab eventKey={'freqLinear'} title="Frequency Domain (Linear)">
            <canvas ref="freqLinear" width={width} height={height} />
          </Tab>
          <Tab eventKey={'freqDecibel'} title="Frequency Domain (Decibel)">
            <canvas ref="freqDecibel" width={width} height={height} />
          </Tab>
          <Tab eventKey={'time'} title="Time Domain">
            <canvas ref="time" width={width} height={height} />
          </Tab>
        </Tabs>
      </div>
    );
  }
}
