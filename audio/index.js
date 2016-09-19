/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

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
export function createAudioAnalyzer(params: SvmFFTConfig) {
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
export function createSoundDetectorSVM(fftParams: SvmFFTConfig,
    svmParams: SvmSoundsConfigs) {
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

/**
 * Parse the ArrayBuffer `modelArrayBuffer` into a JSON object that
 * represents an SVM configuration.  The returned JSON object can be
 * used with `createSoundDetectorSVM()` to create a sound event
 * detector.
 */
export function parsePackedSVMModel(modelArrayBuffer: Buffer) {
  let array = new Float64Array(modelArrayBuffer);
  // The values that we extract from the packed SVM model have been
  // computed by the training process, and the actual parameters
  // comprise the "internal" representation used by the svmjs module.
  // They're briefly described below.
  //
  // `N`: the number of "support vectors" that have been selected for
  // this SVM.
  //
  // `D`: dimensionality of the support vectors.
  //
  // `b`: learned bias term that's applied to vectors.
  //
  // `rbfSigma`: for the Gaussian rational basis function used to
  // "smooth" the input data, `rbfSigma` approximately describes the
  // "radius" of the smoothing.  There's an analogy to the radius of a
  // Gaussian blur.
  let [ N, D, b, rbfSigma ] = array.subarray(0, 4);
  array = array.subarray(4);
  // `alpha`: these are approximately weights on the individual
  // support vectors.
  let alpha = array.subarray(0, N);
  array = array.subarray(N);
  // `labels`: these are the user-supplied labels on the training
  // data, which for the trained model here means that they're the
  // labels assigned to the support vectors.
  let labels = array.subarray(0, N);
  array = array.subarray(N);
  // These are the learned support vectors.
  let vectors = [ ];
  for (let i = 0; i < N; ++i) {
    let vector = array.subarray(0, D);
    vectors.push(vector);
    array = array.subarray(D);
  }
  if (array.length !== 0) {
    log.error(`Un-parsed data in packed model`);
    return null;
  }
  // NB: this is the "internal representation" that svmjs wants for
  // its `fromJSON()` API.  Please don't change the property names.
  return {
    N, D, b, kernelType: 'rbf', rbfSigma, alpha, labels, data: vectors,
  };
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
  babycry: {
    enabled: true,
    soundClass: 'babycry',
    model: 'babycry-svm.raw',
    // This defines which FFT result type we'll use for SVM
    // classification.  It's been found empirically that linear
    // magnitudes are much more discriminative than decibel magnitudes
    // (which aren't discriminative with basic SVM params).  This is
    // most likely because linear magnitudes are "more normalized"
    // than log-decibel, but no effort was spent investigating this.
    fftType: 'fftMagnitudeLinear',
    loudThreshold: LOUD_SOUND_THRESHOLD_LINEAR,
    loudMinDuration: 0.256,
    // How many consecutive FFT frames we collect for the loud sound
    // that we're going to classify.  This is a magic number created
    // by eyeballing the spectrograms of some recorded clap sounds.
    // 16 is about a quarter second of (overlapped) spectrogram frames
    // with 16KHz sampling and the FFT params above, and is short
    // enough that fairly quick repeated clappings can be reliably
    // detected (but not /really/ quick ones).  No effort has been
    // made to optimize this value.
    featureVectorFrameCount: 16,
    hasSustain: true,
    quietTimeout: 0.512,
    sonemeGapTimeout: 0.512,

    trainingOptions: {
      // Achieves good results on subsampled training dataset (0
      // misses, 2 false-accepts).
      rbfsigma: 0.3,
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

  clap: {
    enabled: false,
    soundClass: 'clap',
    model: 'clap-svm.raw',
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
      // This achieves OK results (4 miss, 0 false-accept) across the
      // two training subsets.
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

  firealarm: {
    enabled: false,
    soundClass: 'firealarm',
    model: 'firealarm-svm.raw',
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
    enabled: false,
    soundClass: 'glassbreak',
    model: 'glassbreak-svm.raw',
    fftType: 'fftMagnitudeLinear',
    loudThreshold: LOUD_SOUND_THRESHOLD_LINEAR,
    loudMinDuration: 0.256,
    featureVectorFrameCount: 16,
    hasSustain: true,
    quietTimeout: 0.512,
    sonemeGapTimeout: 0.512,

    trainingOptions: {
      // This achieves OK results (8 miss, 0 false-accept) on the two
      // training subsets.
      rbfsigma: 0.5,
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
};

type ParsedModelType = {
  N: number;
  D: number;
  b: number;
  kernelType: string;
  rbfSigma: number;
  alpha: Float64Array;
  labels: Float64Array;
  data: Array<Float64Array>;
};

export type SvmSoundsConfig = {
  enabled: boolean;
  soundClass: string;
  model: string | ParsedModelType;
  fftType: string;
  loudThreshold: number;
  loudMinDuration: number;
  featureVectorFrameCount: number;
  hasSustain: boolean;
  quietTimeout: number;
  sonemeGapTimeout: number;
  trainingOptions: {
    rbfsigma: number;
    C: number;
    maxiter: number;
    numpasses: number;
    kernel: string;
    tol: number;
    alphatol: number;
  };
};

export type SvmSoundsConfigs = {[key: string]: SvmSoundsConfig};
export type SvmFFTConfig = typeof svmFFTConfig;
export type { SoundDetectorSVM };
