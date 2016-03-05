import createLog from 'silk-log';

import AudioAnalyzer from './lib/AudioAnalyzer';
import SoundDetectorSVM from './lib/SoundDetectorSVM';

const log = createLog('silk-audio');

let isPowerOfTwo = (x) => (x & (x - 1)) === 0;

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
export function createSoundDetectorSVM(params) {
  let cfg = { };
  Object.assign(cfg, params);
  let analyzer = createAudioAnalyzer({
    fftSize: cfg.fftSize,
    windowOverlap: cfg.windowOverlap,
    sampleRate: cfg.sampleRate,
    sampleMin: cfg.sampleMin,
    sampleMax: cfg.sampleMax
  });
  if (!analyzer) {
    log.error('Invalid params');
    return null;
  }
  for (let param of requiredParams) {
    if (!(param in cfg)) {
      log.error(`Missing required param ${param}`);
      return null;
    }
  };
  if (!(typeof cfg.model === 'object' || typeof cfg.model === 'string')) {
    log.error('Invalid model type specified');
    return null;
  }
  return new SoundDetectorSVM(analyzer, cfg);
}
