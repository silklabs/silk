import config from 'silk-config';
import createLog from 'silk-log';

import AudioAnalyzer from './lib/AudioAnalyzer';
import SoundDetectorSVM from './lib/SoundDetectorSVM';

const log = createLog('silk-audio');

let isPowerOfTwo = (x) => (x & (x - 1)) === 0;

export const LOUD_SOUND_THRESHOLD_DB = -40;
export const LOUD_SOUND_THRESHOLD_LINEAR = 0.01;

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
export function createAudioAnalyzer(params) {
  let { fftSize, windowOverlap, sampleRate, sampleMin, sampleMax } = params;
  if (!(0 <= fftSize
        && fftSize === (fftSize | 0)
        && isPowerOfTwo(fftSize))) {
    log.error(`'fftSize' must be a power of two`);
    return null;
  }
  if (!(0 <= windowOverlap && windowOverlap < fftSize)) {
    log.error(`'windowOverlap' must be in the range [ 0, fftSize )`);
    return null;
  }
  if (!(sampleMin < sampleMax)) {
    log.error(`'sampleMin' must be less than 'sampleMax'`);
    return null;
  }
  let range = (sampleMax - sampleMin);
  let scale = 2.0 / range;
  let offset = -(sampleMax + sampleMin) / range;
  return new AudioAnalyzer(fftSize, windowOverlap, sampleRate, scale, offset);
}

/**
 */
const requiredParams = [
  'featureVectorFrameCount', 'fftType', 'loudThreshold',
  'model', 'soundClass',
];
export function createSoundDetectorSVM(fftParams, svmParams) {
  let svmCfgs = { };
  Object.assign(svmCfgs, svmParams);
  let analyzer = createAudioAnalyzer(fftParams);
  if (!analyzer) {
    log.error('Invalid params');
    return null;
  }
  for (let key in svmCfgs) {
    let cfg = svmCfgs[key];
    for (let param of requiredParams) {
      if (!(param in cfg)) {
        log.error(`Config ${key} missing required param ${param}`);
        return null;
      }
    }
    if (!(typeof cfg.model === 'object' || typeof cfg.model === 'string')) {
      log.error(`Invalid model type specified for ${key}`);
      return null;
    }
  }
  return new SoundDetectorSVM(analyzer, svmCfgs);
}

//--------------------------------------------------
// Demo SVM sounds and configuration.  This configuration doesn't
// really belong here, but we want to share it across device / sim /
// webapp and there's not a better (existing) location.

export const svmFFTConfig = {
  fftSize: 512,
  windowOverlap: 256,
  sampleRate: config.deviceMic.sampleRate,
  sampleMin: config.deviceMic.sampleMin,
  sampleMax: config.deviceMic.sampleMax,
};

export const svmSoundsConfigs = {
  clap: {
    soundClass: 'clap',
    model: 'clap-svm.json',
    // This defines which FFT result type we'll use for SVM
    // classification.  It's been found empirically that linear
    // magnitudes are much more discriminative than decibel magnitudes
    // (which aren't discriminative with basic SVM params).  This is
    // most likely because linear magnitudes are "more normalized"
    // than log-decibel, but no effort was spent investigating this.
    fftType: 'fftMagnitudeLinear',
    loudThreshold: LOUD_SOUND_THRESHOLD_LINEAR,
    loudMinDuration: 0.512,
    // How many consecutive FFT frames we collect for the loud sound
    // that we're going to classify.  This is a magic number created
    // by eyeballing the spectrograms of some recorded clap sounds.
    // 16 is about a quarter second of (overlapped) spectrogram frames
    // with 16KHz sampling and the FFT params above, and is short
    // enough that fairly quick repeated clappings can be reliably
    // detected (but not /really/ quick ones).  No effort has been
    // made to optimize this value.
    featureVectorFrameCount: 16,
    hasSustain: false,
    quietTimeout: 0.0,
    sonemeGapTimeout: 0.0,

    trainingOptions: {
      // This achieves nearly-optimal results (1 miss, 1 false-accept)
      // across the two training subsets.
      rbfsigma: 1.0,
      C: 1e2,

      // These magic SVM params are the default for svmjs.
      maxiter: 1e4,
      numpasses: 1e1,
      // Linear kernels are broken in svmjs, which is very concerning.
      //svmjs should not be used in production code, at least not for
      //training.
      //
      //kernel: 'linear',
      kernel: 'rbf',
      tol: 1e-4,
      alphatol: 1e-7,
    },
  },

  firealarm: {
    soundClass: 'firealarm',
    model: 'firealarm-svm.json',
    fftType: 'fftMagnitudeLinear',
    loudThreshold: LOUD_SOUND_THRESHOLD_LINEAR,
    loudMinDuration: 0.256,
    featureVectorFrameCount: 16,
    hasSustain: false,
    quietTimeout: 0.512,
    sonemeGapTimeout: 0.512,

    trainingOptions: {
      // This achieves optimal results (0 miss, 0 false-accept) on the
      // two training subsets.
      rbfsigma: 0.1,

      // These magic SVM params are the default for svmjs.
      C: 1e0,
      maxiter: 1e4,
      numpasses: 1e1,
      // Linear kernels are broken in svmjs, which is very concerning.
      //svmjs should not be used in production code, at least not for
      //training.
      //
      //kernel: 'linear',
      kernel: 'rbf',
      tol: 1e-4,
      alphatol: 1e-7,
    },
  },

  glassbreak: {
    soundClass: 'glassbreak',
    model: 'glassbreak-svm.json',
    fftType: 'fftMagnitudeLinear',
    loudThreshold: LOUD_SOUND_THRESHOLD_LINEAR,
    loudMinDuration: 0.256,
    featureVectorFrameCount: 16,
    hasSustain: true,
    quietTimeout: 0.512,
    sonemeGapTimeout: 0.512,

    trainingOptions: {
      // This achieves OK results (3 miss, 1 false-accept) on the two
      // training subsets.
      rbfsigma: 0.1,
      C: 1e1,

      // These magic SVM params are the default for svmjs.
      maxiter: 1e4,
      numpasses: 1e1,
      // Linear kernels are broken in svmjs, which is very concerning.
      //svmjs should not be used in production code, at least not for
      //training.
      //
      //kernel: 'linear',
      kernel: 'rbf',
      tol: 1e-4,
      alphatol: 1e-7,
    },
  },
};
