'use strict';

var assert = require('assert');
var fftSync = require('kissfft').fftSync;

function createBlackmanMask(size) {
  const ALPHA = 0.16;
  const A0 = 0.5 * (1 - ALPHA);
  const A1 = 0.5;
  const A2 = 0.5 * ALPHA;

  var blackmanMask = new Float32Array(size);
  for (var i = 0; i < size; ++i) {
    var x = i / size;
    blackmanMask[i] = A0 - A1 * Math.cos(2 * Math.PI * x) + A2 * Math.cos(4 * Math.PI * x);
  }
  return blackmanMask;
}

function windowing(signal, mask) {
  assert(signal.length == mask.length);
  for (var n = 0; n < signal.length; ++n)
    signal[n] *= mask[n];
}

function melToFreq(melValue) {
  var freqValue = 700 * (Math.exp(melValue / 1125) - 1);
  return freqValue;
}

function freqToMel(freqValue) {
  var melValue = 1125 * Math.log(1 + (freqValue / 700));
  return melValue;
}

function createMelFilterBank(numFilters, sampleRate, fftSize) {
  // the +2 is the upper and lower limits
  let melValues = new Float32Array(numFilters + 2);
  let melValuesInFreq = new Float32Array(numFilters + 2);

  // Generate limits in Hz - from 0 to the nyquist.
  let lowerLimitFreq = 0;
  let upperLimitFreq = sampleRate / 2;

  // Convert the limits to Mel
  let lowerLimitMel = freqToMel(lowerLimitFreq);
  let upperLimitMel = freqToMel(upperLimitFreq);

  // Find the range
  let range = upperLimitMel - lowerLimitMel;

  // Find the range as part of the linear interpolation
  let valueToAdd = range / (numFilters + 1);
  let fftBinsOfFreq = Array(numFilters + 2);
  for (let i = 0; i < melValues.length; i++) {
    // Initialising the mel frequencies
    // They're a linear interpolation between the lower and upper limits.
    melValues[i] = i * valueToAdd;

    // Convert back to Hz
    melValuesInFreq[i] = melToFreq(melValues[i]);

    // Find the corresponding bins
    fftBinsOfFreq[i] = Math.floor((fftSize + 1) * melValuesInFreq[i] / sampleRate);
  }

  var filterBank = Array(numFilters);
  for (let j = 0; j < filterBank.length; j++) {
    // Create a two dimensional array of size numFilters * (buffersize/2)+1
    // pre-populating the arrays with 0s.
    filterBank[j] = Array.apply(null,
                                new Array((fftSize / 2) + 1)).map(Number.prototype.valueOf, 0);

    // creating the lower and upper slopes for each bin
    for (let i = fftBinsOfFreq[j]; i < fftBinsOfFreq[j + 1]; i++)
      filterBank[j][i] = (i - fftBinsOfFreq[j]) / (fftBinsOfFreq[j + 1] - fftBinsOfFreq[j]);

    for (let i = fftBinsOfFreq[j + 1]; i < fftBinsOfFreq[j + 2]; i++)
      filterBank[j][i] = (fftBinsOfFreq[j + 2] - i) / (fftBinsOfFreq[j + 2] - fftBinsOfFreq[j + 1]);
  }

  return filterBank;
}

function preemphasis(signal, coeff) {
  coeff = coeff || 0.95;
  var output = new Float32Array(signal.length);
  for (var n = 1; n < signal.length; ++n)
    output[n] = signal[n] - coeff * signal[n-1];
  return output;
}

function powerSpectrum(spectrum) {
  for (var i = 0; i < spectrum.length; ++i)
    spectrum[i] *= spectrum[i];
  return spectrum;
}

class MelFeatureExtractor {
  constructor(numFilters, sampleRate, fftSize) {
    this.numFilters = numFilters;
    this.fftSize = fftSize;
    assert(!(fftSize & (fftSize - 1))); // must be power of 2
    this.blackmanMask = createBlackmanMask(fftSize);
    this.melFilterBank = createMelFilterBank(numFilters, sampleRate, fftSize);
    this.fftBins = fftSize / 2;
    this.fftOutput = new Float32Array(fftSize + 2);
    this.fftMag = new Float32Array(this.fftBins);
  }

  process(inputSignal) {
    var fftSize = this.fftSize;
    assert(inputSignal.length == fftSize);
    var signal = preemphasis(inputSignal); // high-pass filter
    windowing(signal, this.blackmanMask);
    var fftOutput = this.fftOutput;
    fftSync(signal, fftOutput);
    var fftBins = this.fftBins;
    var fftMag = this.fftMag;
    for (var i = 0; i < fftBins; ++i)
      fftMag[i] = Math.hypot(fftOutput[2 * i], fftOutput[2 * i + 1]) / fftSize;
    var melFilterBank = this.melFilterBank;
    var ps = powerSpectrum(fftMag);
    var melBands = new Float32Array(this.numFilters);
    for (var i = 0; i < melBands.length; ++i) {
      var m = 0;
      for (var j = 0; j < fftBins; ++j)
        m += melFilterBank[i][j] * ps[j];
      m = (m > 0) ? Math.log(m) : 0;
      melBands[i] = m;
    }
    return melBands;
  }
}

module.exports = MelFeatureExtractor;
