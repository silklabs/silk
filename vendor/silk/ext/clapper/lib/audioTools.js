/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab */

/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

let log;
import { EventEmitter } from 'events';
import { fft } from 'kissfft';

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
  }

  // Push node to list
  push(node) {
    this.list.push(node);
  }

  // check if history depth is fully primed
  isPrimed() {
    return (this.list.length >= this.depth);
  }

  // Return historical node. 0 = current, 1 = prior node, etc.
  getNode(i) {
    if (i >= this.depth || i >= this.list.length) {
      throw new Error('req invalid history:', i, this.list.length, this.depth);
    } else {
      return this.list[this.depth - 1 - i];
    }
  }

  shift() {
    if (this.list.length === 0) {
      throw new Error('removing too much history', this.list.length);
    } else {
      return this.list.shift();
    }
  }
}

class FftProcessor extends EventEmitter {
  constructor(cfg = {}) {
    super();

    let params = ['sampleRate', 'bytesPerSample', 'fftWindowSize', 'fftWindowStep'];
    params.forEach(param => {
      if (!(param in cfg)) {
        throw `Missing ${param} in cfg`;
      }
    });

    this._sampleRate = cfg.sampleRate;
    this._bytesPerSample = cfg.bytesPerSample;
    this._fftWindowSize = cfg.fftWindowSize;
    this._fftWindowStep = cfg.fftWindowStep;

    this._inputBuffer = new Buffer(0);
    this._windowCnt = 0;
  }

  _performFft(when) {
    let fftNode = {
      windowCnt: this._windowCnt,
      when: when, // ms from epoch
      timeStart: this._windowCnt * this._fftWindowStep / this._sampleRate,
      windowSize: this._fftWindowSize,
      sampleRate: this._sampleRate,
      time: [],
      freq: []
    };
    this._windowCnt++;

    // fft routine will use optimized algorithm if window size is power of 2
    // and input contains only real values. output is returned like:
    // [real(i), img(i), real(i+1), img(i+1), ...] where i is
    // (window size / 2) + 1, positive freqs + Nyquist freq.
    let fftInput = new Float32Array(this._fftWindowSize);
    let fftOutput = new Float32Array(this._fftWindowSize + 2);

    for (let i = 0; i < this._fftWindowSize; i++) {
      fftInput[i] = this._inputBuffer.readInt16LE(2 * i);
      fftNode.time[i] = this._inputBuffer.readInt16LE(2 * i);
    }

    return new Promise(resolve => {
      fft(fftInput, fftOutput, (err, result) => {
        if (err) {
          log.error('fft calculation error', err, result);
        }
        for (let i = 0; i < (this._fftWindowSize / 2) + 1; i++) {
          fftNode.freq[i] = Math.abs(fftOutput[i]);
        }
        resolve(fftNode);
      });
    });
  }

  processSamples(when, samples) {
    this._inputBuffer = Buffer.concat([this._inputBuffer, samples]);
    let windowBytes = this._fftWindowSize * this._bytesPerSample;
    let fftPromises = [];

    // compute fft avg energy level provided buffer has 1 window of data
    while (this._inputBuffer.length >= windowBytes) {
      fftPromises.push(this._performFft(when));

      // step to next window
      let windowStepBytes = this._fftWindowStep * this._bytesPerSample;
      let rest = new Buffer(this._inputBuffer.length - windowStepBytes);
      this._inputBuffer.copy(rest, 0, windowStepBytes);
      this._inputBuffer = rest;

      when += this._fftWindowStep / this._sampleRate;
    }

    // process results in order
    let chain = Promise.resolve();
    fftPromises.forEach(fftPromise => {
      chain = chain
        .then(() => fftPromise)
        .then(fftNode => {
          this.emit('fftDone', fftNode);
        })
        .catch(e => log.error('error', e));
    });
  }
}

class WavFileSaver extends EventEmitter {
  constructor(filename, durationSecs, cfg) {
    super();

    let params = ['sampleRate', 'bytesPerSample', 'numChannels'];
    params.forEach(param => {
      if (!(param in cfg)) {
        throw `Missing ${param} in cfg`;
      }
    });

    this._filename = filename;
    this._durationSecs = durationSecs;
    this._sampleRate = cfg.sampleRate;
    this._bytesPerSample = cfg.bytesPerSample;
    this._numChannels = cfg.numChannels;

    this._pcmSamples = new Buffer(0);
  }

  addSamples(samples) {
    let bytesToSave = this._sampleRate * this._bytesPerSample * 
        this._numChannels * this._durationSecs;

    if (this._pcmSamples.length < bytesToSave) {
      this._pcmSamples = Buffer.concat([this._pcmSamples, samples]);
    } else if (!this._fileSaved) {
      let dataSize = this._pcmSamples.length;
      let chunkSize = 36 + dataSize;

      let byteRate = this._sampleRate * this._bytesPerSample * this._numChannels;
      let blockAlign = this._numChannels * this._bytesPerSample;
      let bitsPerSample = this._bytesPerSample * 8;

      let hdr = new Buffer(44);
      hdr.writeUInt32BE(0x52494646, 0);          // "RIFF"
      hdr.writeUInt32LE(chunkSize, 4);           // chunk size
      hdr.writeUInt32BE(0x57415645, 8);          // "WAVE"
      hdr.writeUInt32BE(0x666d7420, 12);         // subchunk1 id- "fmt"
      hdr.writeUInt32LE(16, 16);                 // subchunk1 size
      hdr.writeUInt16LE(1, 20);                  // audio format
      hdr.writeUInt16LE(this._numChannels, 22);  // num channels
      hdr.writeUInt32LE(this._sampleRate, 24);   // sample rate
      hdr.writeUInt32LE(byteRate, 28);           // byte rate
      hdr.writeUInt16LE(blockAlign, 32);         // block align
      hdr.writeUInt16LE(bitsPerSample, 34);      // bits per sample
      hdr.writeUInt32BE(0x64617461, 36);         // subchunk2 id - "data"
      hdr.writeUInt32LE(dataSize, 40);           // data size

      let wavData = Buffer.concat([hdr, this._pcmSamples]);

      let fs = require('fs');
      fs.writeFile(this._filename, wavData, err => {
        this.emit('fileSaved', err ? err : '');
      });
      this._fileSaved = true;
    }
  }
}

class AudioDiag extends EventEmitter {
  constructor(serverUrl, emitHz, fftCfg) {
    super();
    this._listenerObjects = [];
    this._serverUrl = serverUrl;
    this._lastEmitMs = 0;
    this._emitHz = emitHz;

    log.info(`Connecting to ${serverUrl}`);
    let opts = {
      autoConnect: true,
      forceNew: true,
      transports: ['websocket']
    };
    this.socket = require('socket.io-client')(serverUrl, opts);

    this._onConnect = () => {
      log.info('connected to server');
      this.socket.emit('info', 
          { windowSize: fftCfg.fftWindowSize, sampleRate: fftCfg.sampleRate });
    };
    this._onDisconnect = () => log.info('disconnected to server');

    this.socket.on('connect', this._onConnect);
    this.socket.on('disconnect', this._onDisconnect);

    this._saveListener('connect', this._onConnect);
    this._saveListener('disconnect', this._onDisconnect);

    this._emitCnt = 0;
  }

  _saveListener(event, listener) {
    this._listenerObjects.push({event, listener});
  }

  cleanup() {
    this.socket.disconnect();
    this._listenerObjects.forEach(listenerObj => {
      this.socket.removeListener(listenerObj.event, listenerObj.listener);
    });
  }

  addFftNode(fftNode) {
    if (this.socket.connected) {
      if (fftNode.when - this._lastEmitMs >= 1000 / this._emitHz) {
        this.socket.emit('fft', fftNode);
        this._lastEmitMs = fftNode.when;
      }
    }
  }
}

module.exports = env => {
  log = env.log;
  return { WindowHistory, FftProcessor, AudioDiag, WavFileSaver };
};
