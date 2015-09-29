/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab */

/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

let log = require('./log')('clapper');
let events = require('events');
let fft = require('kissfft').fft;

//
// WindowHistory - helper for algorithms to track historical calculations
//
// Store historical data per window. Keep 'depth' counts of history.
//
// Internally, works like this:
//   * 0 element of list is always oldest in history
//   * depth-1 element is current
//   * if length < depth, then not enough history
//   * get(n) is array[depth-1-n]; if depth = 3, get{0,1,2} => index{2,1,0}
//
class WindowHistory {
  constructor(depth) {
    this.list = [];
    this.depth = depth; // depth has to be at least 1;
    this.windowCnt = 0;
  }

  // Create new node and add to list
  new() {
    let node = {
      data: null,
      match: false,
      windowCnt: this.windowCnt
    };
    this.windowCnt++;
    this.list.push(node);

    return node;
  }

  // Check if all nodes in history are valid
  // Note: the fft routine is multi-threaded, so results can come out of order
  isValid() {
    if (this.list.length < this.depth) { // not enough history
      return false;
    }

    for (var i = 0; i < this.depth; i++) {
      if (this.list[i].data === null) {
        return false;
      }
    }
    return true;
  }

  // Check if any nodes in history has a match
  hasMatch() {
    if (this.list.length < this.depth) { // not enough history
      return false;
    }

    for (var i = 0; i < this.depth; i++) {
      if (this.list[i].data !== null && this.list[i].match) {
        return true;
      }
    }
    return false;
  }

  // Return historical node. 0 = current, 1 = prior node, etc.
  getNode(i) {
    if (i >= this.depth || i >= this.list.length) {
      throw new Error('req invalid history:', i, this.list.length, this.depth);
    } else {
      return this.list[this.depth - 1 - i];
    }
  }

  advance() {
    if (this.list.length === 0) {
      throw new Error('removing too much history', this.list.length);
    } else {
      this.list.shift();
    }
  }
}

//
// ClapDetector
//
// Basic algorithm for detecting claps. The algorithm processes a continuous
// stream of PCM samples to detect if the average energy in the frequency
// domain spikes up very quickly. A clap sound results in a sharp rise in
// all frequencies. Talking is more gradual, and even then, not across all
// frequencies. Additionally, we check that the energy is maintained for
// ~120ms to filter out other sounds (like knocks) that don't maintain
// energy like a clap.
//
// In more detail, we perform a FFT on a set of samples. The number of samples
// is _fftWindowSize, and we do this ever time we receive another
// _fftWindowStep number of samples. The FFT across N samples will give us
// the energy at each freq bucket between 0 and samplingRate / 2, where each
// bucket size is samplingRate / N; this is just how FFT works. The more
// samples you use, the more granular your frequency buckets. For clapping,
// we don't need too much precision, so the window size doesn't matter too much.
//
// We take the FFT results and calculate the average energy across ALL freq
// buckets and then save this off; let's call this the AWE for "Average Window
// Energy." When we have enough AWE values saved off, we check to see if there
// is a large rise (_deltaThreshold) between the current AWE and and one
// _deltaDistance back. Using 2 for _deltaDistance is good because it smooths
// thing over in case the clap started in the middle of a PCM sample. Also,
// when a clap starts, the AWE will continue to rise for a few PCM samples,
// so, we don't consider it another clap if there was a large rise within the
// last few PCM samples back, specifically _minDistance back.
//
// _deltaThreshold is the value we'll have to tune the most as it depends on
// the mic sensitivity.
//
// To filter out other sounds with a quick rise, we check that the AWE is
// maintained above a certain threshold for a specifc duration.
//
export class ClapDetector extends events.EventEmitter {
  constructor(cfg = {}, timeline) {
    super();

    this.timeline = timeline;

    // TODO: hard coded constants assumed
    this._sampleRate = 8000;      // assumes 8000 samples / second
    this._bytesPerFrame = 2;      // assumes samples are signed 16 bit

    // parameters to tune
    this._maxClapIntervalMs = 450;// max time in ms between 2 claps to be 'repeated'
    this._minDistance = 8;        // min dist. between 2 claps (units of fftWindowStep)
    this._deltaThreshold = 30000; // consider a clap if avg freq energy between
                                  // 2 windows is above this threshold.
    this._deltaDistance = 4;      // the previous window's energy to compare against.
                                  // (units of fftWindowStep, must be < minDistance)
    this._fftWindowSize = 256;    // 320ms - in units of samples
    this._fftWindowStep = 16;     // 2ms - in units of samples

    this._minEnergyThreshold = 45000; // min energy for duration of clap
    this._minEnergyDuration = 35;     // clap must maintain energy for this
                                      // duration, units of fftWindowStep
    this._maxEnergyDuration = 150;    // clap energy must not exceed this
                                      // duration, units of fftWindowStep

    this._windowHistory = new WindowHistory(this._minDistance);
    this._inputBuffer = new Buffer(0);

    this._highEnergyCnt = 0;
    this._highEnergyStart = null;
    this._lastClapTime = 0;
    this._repeatedClapCnt = 0;

    this.totalClapCnt = 0;

    // debug
    this._debug = false;
    this._pcmSamples = new Buffer(0);
    this._fileSaved = false;
    this._debugFilename = '/data/media/micInputDebug.wav';

    if ('deltaThreshold' in cfg) {
      log.info('Setting deltaThreshold to', cfg.deltaThreshold);
      this._deltaThreshold = cfg.deltaThreshold;
    }
    if ('maxClapIntervalMs' in cfg) {
      log.info('Setting maxClapIntervalMs to', cfg.maxClapIntervalMs);
      this._maxClapIntervalMs = cfg.maxClapIntervalMs;
    }
  }

  _onCalcFftWindowDone(node, avg) {
    node.data = avg;

    // only process if all histroy is valid
    // note fft processing is threaded and results can come in out of order
    while (this._windowHistory.isValid()) {
      // compare with deltaDistance windows back
      let cur = this._windowHistory.getNode(0);
      let prev = this._windowHistory.getNode(this._deltaDistance);

      if ((cur.data - prev.data) > this._deltaThreshold) {
        // found initial large rise in energy, now need to maintain energy
        cur.match = true;
        this._highEnergyStart = cur.windowCnt;
        this._highEnergyCnt = 0;
      }
      if (this._highEnergyStart !== null) {
        // we detected high energy, now need to see its duration
        if (cur.data > this._minEnergyThreshold) {
          // energy level met threshold, need to maintain for a little bit
          this._highEnergyCnt++;
        } else {
          if (this._highEnergyCnt >= this._minEnergyDuration &&
              this._highEnergyCnt < this._maxEnergyDuration) {
            // energy is not too short or long, consider this a clap
            this.totalClapCnt++;

            let now = Date.now();
            if (now - this._lastClapTime < this._maxClapIntervalMs) {
              this._repeatedClapCnt++;
            } else {
              this._repeatedClapCnt = 1;
            }
            this._lastClapTime = now;

            log.debug('clap detected', this.totalClapCnt,
              this._highEnergyStart * this._fftWindowStep / this._sampleRate,
              this._highEnergyCnt);

            // don't send the event until the number of claps is confirmed
            if (this._nextClapTimeout) {
              clearTimeout(this._nextClapTimeout);
            }
            this._nextClapTimeout = setTimeout(
              () => {                       // eslint-disable-line no-loop-func
                this.timeline.addClap(this._repeatedClapCnt);
              },
              this._maxClapIntervalMs
            );
          } else {
            log.debug('  no clap:',
                this._highEnergyStart,
                this._highEnergyStart * this._fftWindowStep / this._sampleRate,
                this._highEnergyCnt);
          }
          this._highEnergyStart = null;
        }
      }
      this._windowHistory.advance();
    }
  }

  processPcmFrames(frames) {
    let windowBytes = this._fftWindowSize * this._bytesPerFrame;
    let windowStepBytes = this._fftWindowStep * this._bytesPerFrame;

    if (this._debug) {
      this._debugSaveToFile(frames);
    }

    this._inputBuffer = Buffer.concat([this._inputBuffer, frames]);

    // compute fft avg energy level provided buffer has 1 window of data
    while (this._inputBuffer.length >= windowBytes) {
      let node = this._windowHistory.new();
      this._calcFftAvgWindowEnergy(node);

      // step to next window
      let rest = new Buffer(this._inputBuffer.length - windowStepBytes);
      this._inputBuffer.copy(rest, 0, windowStepBytes);
      this._inputBuffer = rest;
    }
  }

  // calcultes the avg energy of the fft window
  _calcFftAvgWindowEnergy(node) {
    let windowCnt = node.windowCnt;
    let sampleRate = this._sampleRate;
    let windowSize = this._fftWindowSize;
    let windowStep = this._fftWindowStep;

    // fft routine will use optimized algorithm if window size is power of 2
    // and input contains only real values. output is returned like:
    // [real(i), img(i), real(i+1), img(i+1), ...] where i is
    // (window size / 2) + 1, positive freqs + Nyquist freq.
    let fftInput = new Float32Array(windowSize);
    let fftOutput = new Float32Array(windowSize + 2);
    let timeX = [];
    let timeY = [];

    for (let i = 0; i < windowSize; i++) {
      timeX[i] = (i + (windowCnt * windowStep)) / sampleRate;
      timeY[i] = this._inputBuffer.readInt16LE(2 * i);

      fftInput[i] = this._inputBuffer.readInt16LE(2 * i);
    }

    let that = this;
    fft(fftInput, fftOutput, function (err, result) {
      if (err) {
        log.error('fft calculation error', err, result);
      }

      let freqX = [];
      let freqY = [];
      let avg = 0;

      for (let i = 0; i < (windowSize / 2) + 1; i++) {
        freqX[i] = i / windowSize * sampleRate;
        let val = Math.abs(fftOutput[i]);
        freqY[i] = val;
        avg += val;
      }
      avg = avg / (windowSize / 2);

      that._onCalcFftWindowDone(node, avg);

      // TODO: add code to handle fft 'data' event, to send to diag
      that.emit('data', {
        index: windowCnt,
        time: { x: timeX, y: timeY },
        freq: { x: freqX, y: freqY },
        avg: avg
      });
    });
  }

  _debugSaveToFile(samples) {
    if (this._pcmSamples.length < 8000 * 2 * 20) {
      this._pcmSamples = Buffer.concat([this._pcmSamples, samples]);
    } else if (!this._fileSaved) {
      let dataSize = this._pcmSamples.length;
      let chunkSize = 36 + dataSize;

      let hdr = new Buffer(44);
      hdr.writeUInt32BE(0x52494646, 0);  // "RIFF"
      hdr.writeUInt32LE(chunkSize, 4);   // chunk size
      hdr.writeUInt32BE(0x57415645, 8);  // "WAVE"
      hdr.writeUInt32BE(0x666d7420, 12); // subchunk1 id- "fmt"
      hdr.writeUInt32LE(16, 16);         // subchunk1 size
      hdr.writeUInt16LE(1, 20);          // audio format
      hdr.writeUInt16LE(1, 22);          // num channels
      hdr.writeUInt32LE(8000, 24);       // sample rate
      hdr.writeUInt32LE(16000, 28);      // byte rate = 8000 * 1 chan * 2 bytes/sam
      hdr.writeUInt16LE(2, 32);          // block align = 1 channel * 2 bytes/sam
      hdr.writeUInt16LE(16, 34);         // bits per sample = 16
      hdr.writeUInt32BE(0x64617461, 36); // subchunk2 id - "data"
      hdr.writeUInt32LE(dataSize, 40);   // data size = samples * 1 chan * 2 bytes/sam

      let wavData = Buffer.concat([hdr, this._pcmSamples]);

      let fs = require('fs');
      log.info('saving audio data to', this._debugFilename);
      fs.writeFile(this._debugFilename, wavData, (err) => {
        log.info('audio file saved, err:', err);
      });
      this._fileSaved = true;
    }
  }
}

