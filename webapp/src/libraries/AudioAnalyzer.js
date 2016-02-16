import { EventEmitter} from 'events';
import { KissFFTR } from '../../external/js-kissfft';

// Constants used to compute the Blackman windowing function below.
// See WebAudio specification, section 2.23.3 "FFT Windowing and
// smoothing over time".
const ALPHA = 0.16;
const A0 = 0.5 * (1 - ALPHA);
const A1 = 0.5;
const A2 = 0.5 * ALPHA;

let isPowerOfTwo = (x) => (x & (x - 1)) === 0;

/**
 * Modeled on the WebAudio `AnalyserNode` API (except spelled
 * correctly).  The following analysis events are emitted and clients
 * can use `audioAnalyzer.on([event], (values) => ...)` to listen to
 * the events:
 *
 *  1. `'timeDomain'`: array of normalized samples in the current
 *     analysis window
 *
 *  2. `'fft'`: complex numbers `(r + i c)` comprising the FFT of the
 *     current analysis window, returned interleaved as `[ r_1, c_1, r_2,
 *     c_2, ..., r_N, c_N ]`.
 *
 *  3. `'fftMagnitudeLinear'`: array of FFT magnitudes (amplitudes) on
 *     linear scale
 *
 *  4. `'fftMagnitudeDecibel'`: array of FFT magnitudes (amplitudes)
 *     on log-decibel scale
 *
 * Clients may listen to any or all of the analysis events above.  The
 * events are fired in a defined sequence in one event-loop iteration
 * when each successive full window of samples is ready for analysis.
 * This means that within this firing sequence, the data in each
 * delivered event is consistent with all the others --- that is,
 * computed from the same input window.  The defined sequence of
 * events firing is the ordered list above.
 */
class AudioAnalyzer extends EventEmitter {
  fft: KissFFTR;
  fftInput: Float32Array;
  fftSize: number;
  inputWindow: Float32Array;
  inputToFill: number;
  outputMagnitudes: Float32Array;
  windowOverlap: number;
  // TODO: let the caller specify the windowing function?
  // TODO: smoothing?

  // This is a private API.  Use `createAudioAnalyzer()` below.
  constructor(fftSize, windowOverlap, sampleScale, sampleOffset) {
    super();
    this.fftSize = fftSize;
    this.windowOverlap = windowOverlap;
    this.sampleScale = sampleScale;
    this.sampleOffset = sampleOffset;

    this.fft = new KissFFTR(this.fftSize);
    this.fftInput = new Float32Array(this.fftSize);
    this.inputWindow = new Float32Array(this.fftSize);
    this.inputToFill = this.fftSize;
    this.outputMagnitudes = new Float32Array(this.fftSize / 2);
  }

  /**
   * Return the number of frequency bins that each FFT will compute,
   * i.e. the number of complex values returned by the `'fft'` event
   * and the number of magnitudes returned by the `'fftMagnitude*'`
   * events.
   */
  get frequencyBinCount() {
    return this.fftSize / 2;
  }

  /**
   * Feed `samples` into the audio analyzer.  `samples` may be of any
   * length, but sample values should be constrainted within the range
   * `[ params.sampleMin, params.sampleMax ]`.  If consuming `samples`
   * results in filling one or more FFT windows, then the FFTs will be
   * computed and resulting events delivered to clients.
   */
  appendSamples(samples) {
    let inputWindowLength = this.inputWindow.length;
    let samplesIndex = 0;
    while (true) {              //eslint-disable-line no-constant-condition
      let samplesBatch = samples.slice(samplesIndex,
                                       samplesIndex + this.inputToFill);
      if (samplesBatch.length === 0) {
        // Consumed all of the current `samples` buffer.
        return;
      }
      this.inputWindow.set(samplesBatch, inputWindowLength - this.inputToFill);
      this.inputToFill -= samplesBatch.length;
      samplesIndex += samplesBatch.length;
      if (this.inputToFill) {
        // Window not full yet.  Try to grab more samples.
        continue;
      }
      // Filled the input buffer.  Do an FFT.
      this._emitFFT();
      // Shift the overlapped samples into place.
      this.inputWindow.copyWithin(0, -this.windowOverlap);
      // And reset the number of samples we're awaiting.
      this.inputToFill = inputWindowLength - this.windowOverlap;
    }
  }

  // Run audio analyses on the current full sample window and deliver
  // results to clients.
  _emitFFT() {
    let doFFTMagnitudeDecibel =
          this.listenerCount('fftMagnitudeDecibel') > 0;
    let doFFTMagnitudeLinear = doFFTMagnitudeDecibel
          || this.listenerCount('fftMagnitudeLinear') > 0;
    let doFFT = doFFTMagnitudeLinear || this.listenerCount('fft') > 0;
    let doNormalization = doFFT || this.listenerCount('timeDomain') > 0;

    if (!doNormalization) {
      console.warn('No listeners for any audio analyses ...');
      return;
    }
    // Normalize samples to the range [ -1.0, 1.0 ].
    let [ scale, offset ] = [ this.sampleScale, this.sampleOffset ];
    for (let i = 0; i < this.fftInput.length; ++i) {
      this.fftInput[i] = this.inputWindow[i] * scale + offset;
    }
    this.emit('timeDomain', this.fftInput);

    if (!doFFT) {
      return;
    }
    // Apply Blackman windowing function (see above) to normalized samples.
    const N = this.fftSize;
    for (let i = 0; i < this.fftInput.length; ++i) {
      let x = i / N;
      let window = (A0 -
                    A1 * Math.cos(2 * Math.PI * x) +
                    A2 * Math.cos(4 * Math.PI * x));
      this.fftInput[i] *= window;
    }

    // Run the forward FFT on the normalized and windowed samples.
    let output = this.fft.forward(this.fftInput);
    this.emit('fft', output);

    if (!doFFTMagnitudeLinear) {
      return;
    }
    // Compute the linear magnitudes of the frequency domain data.
    let i = 0;
    for (i = 0; i < this.frequencyBinCount; ++i) {
      let [ r, c ] = [ output[2 * i], output[2 * i + 1] ];
      this.outputMagnitudes[i] = Math.hypot(r, c) / this.fftSize;
    }
    let dc = output[2 * i];
    let nyquist = output[2 * i + 1];
    this.emit('fftMagnitudeLinear', this.outputMagnitudes, dc, nyquist);

    if (!doFFTMagnitudeDecibel) {
      return;
    }
    // Compute the log-decibel magnitudes of hte frequency domain data.
    for (i = 0; i < this.frequencyBinCount; ++i) {
      let linearMagnitude = this.outputMagnitudes[i];
      this.outputMagnitudes[i] = 20 * Math.log10(linearMagnitude);
    }
    // NB: when compared to WebAudio's AudioNode, our
    // magnitude-decibel computation has been observed to result in
    // errors of up to around 1dB at frequency bins with very low
    // power, ~-230dB.  Candidates for the discrepancy, in approximate
    // order of likelikhood:
    //
    //   - different FFT implementations are being used in browser
    //     (Firefox - libavcodec) vs. KissFFT here.
    //
    //   - `AnalyserNode.getTimeDomainData()` and
    //     `AnalyserNode.getFrequencyData()` aren't atomic in an
    //     event-loop iteration.
    //
    //   - other accumulated errors in scaling or windowing here as
    //     compared to in browser
    //
    // These results were cross-checked by playing a static WAV
    // through a WebAudio AnalyserNode, extracting the (re-)sampled
    // time-domain data and feeding it through our AudioAnalyzer, and
    // comparing to the AnalyserNode's own computed frequency-domain
    // data.
    this.emit('fftMagnitudeDecibel', this.outputMagnitudes);
  }
}

/**
 * Create and return an audio analyzer based on `params`.  The
 * required params are:
 *
 *  - `fftSize`: size of requested FFT, which computed on each window
 *    `fftSize` samples.  It should be a power of 2.
 *
 *  - `windowOverlap`: how many samples each analyzed window overlap
 *    with the previous window
 *
 *  - `sampleMin`: minimum possible value for any sample
 *
 *  - `sampleMax`: maximum possible value for any sample
 *
 * `sampleMin` and `sampleMax` are used to normalize the input
 * samples.  (Yes, they're a leaky abstraction; bad API.)
 *
 * If `params` are invalid, null is returned.
 */
export default function createAudioAnalyzer(params) {
  let { fftSize, windowOverlap, sampleMin, sampleMax } = params;
  if (!(0 <= fftSize
        && fftSize === (fftSize | 0)
        && isPowerOfTwo(fftSize))) {
    console.error(`'fftSize' must be a power of two`);
    return null;
  }
  if (!(0 <= windowOverlap && windowOverlap < fftSize)) {
    console.error(`'windowOverlap' must be in the range [ 0, fftSize )`);
    return null;
  }
  if (!(sampleMin < sampleMax)) {
    console.error(`'sampleMin' must be less than 'sampleMax'`);
    return null;
  }
  let range = (sampleMax - sampleMin);
  let scale = 2.0 / range;
  let offset = -(sampleMax + sampleMin) / range;
  return new AudioAnalyzer(fftSize, windowOverlap, scale, offset);
}
