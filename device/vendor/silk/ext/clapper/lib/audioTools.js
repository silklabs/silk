/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

let log;
let util;
import { EventEmitter } from 'events';
import { fft } from 'kissfft';

// Url to send audio diag data. Consider disabled if prop not set
const AUDIO_DIAG_URL_PROP = 'persist.silk.audioDiagUrl';

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

    let params = ['sampleRate', 'bytesPerSample', 'numChannels',
        'fftWindowSize', 'fftWindowStep'];
    params.forEach(param => {
      if (!(param in cfg)) {
        throw `Missing ${param} in cfg`;
      }
    });

    this._sampleRate = cfg.sampleRate;
    this._bytesPerSample = cfg.bytesPerSample;
    this._numChannels = cfg.numChannels;
    this._fftWindowSize = cfg.fftWindowSize;
    this._fftWindowStep = cfg.fftWindowStep;
    this._fftWindowStepDurationMs = this._fftWindowStep / this._sampleRate * 1000;

    this._windowStepInBytes = this._fftWindowStep * this._bytesPerSample *
        this._numChannels;
    this._windowSizeInBytes = this._fftWindowSize * this._bytesPerSample *
        this._numChannels;

    this._pcmDataQueue = []; // Array of [when, pcmData] tuples
    this._pcmDataQueueSizeInBytes = 0; // Size of all the pcmData buffers in the queue
    this._pcmData = null;    // Current PCM data being processed
    this._pcmDataPosInBytes = 0; // Current window position in _pcmData

    // Emit a periodic log warning when _pcmDataQueue is holding more than
    // 1 second worth of data
    this._backlogMinSizeInBytes = 1 * this._sampleRate * this._bytesPerSample * this._numChannels;
    this._lastBacklogWarningTime = process.hrtime();

    // fft routine will use optimized algorithm if window size is power of 2
    // and input contains only real values. output is returned like:
    // [real(i), img(i), real(i+1), img(i+1), ...] where i is
    // (window size / 2) + 1, positive freqs + Nyquist freq.
    this._fftInput = new Float32Array(this._fftWindowSize);
    this._fftOutput = new Float32Array(this._fftWindowSize + 2);

    this._processingInProgress = false;

    // optionally send fft data to audio diag to visualize for tuning/analysis
    let audioDiagUrl = util.getprop(AUDIO_DIAG_URL_PROP);
    if (audioDiagUrl) {
      this._audioDiag = new AudioDiag(audioDiagUrl, cfg);
    }
  }

  get sampleRate() {
    return this._sampleRate;
  }

  get bytesPerSample() {
    return this._bytesPerSample;
  }

  get numChannels() {
    return this._numChannels;
  }

  get fftWindowSize() {
    return this._fftWindowSize;
  }

  get fftWindowStep() {
    return this._fftWindowStep;
  }

  _processNextFft() {
    if (this._pcmData) {
      // Advance to the next fftWindowStep
      this._when += this._fftWindowStepDurationMs;
      this._pcmDataPosInBytes += this._windowStepInBytes;
      if (this._pcmDataPosInBytes >= this._pcmData.length) {
        this._pcmData = null; // Need a new pcmData buffer
      }
    }

    if (!this._pcmData) {
      this._pcmDataPosInBytes = 0;
      if (this._pcmDataQueue.length === 0) {
        this._processingInProgress = false; // Need more pcm data
        return;
      }
      [this._when, this._pcmData] = this._pcmDataQueue.shift();
      this._pcmDataQueueSizeInBytes -= this._pcmData.length;
    }

    // An fftWindowSize buffer will span 2 pcmData buffers with larger
    // fftWindowStep values.  overrunBytes computes the portion of the
    // fftWindowSize buffer that is in the second pcmData buffer.
    let overrunBytes = (this._pcmDataPosInBytes + this._windowSizeInBytes) - this._pcmData.length;
    let overrun = overrunBytes / ( this._bytesPerSample * this._numChannels );
    if (overrunBytes > 0) {
      if (this._pcmDataQueue.length === 0) {
        // Don't have a second pcmData buffer yet, wait for it
        this._processingInProgress = false;
        return;
      }
    } else {
      overrunBytes = overrun = 0;
    }

    let fftNode = {
      when: this._when,
      windowSize: this._fftWindowSize,
      sampleRate: this._sampleRate,
      time: new Array(this._fftWindowSize),
      freq: new Array(this._fftWindowSize + 2),
    };


    let pcmData = this._pcmData.slice(this._pcmDataPosInBytes);
    let i = 0;
    for (; i < this._fftWindowSize - overrun; i++) {
      this._fftInput[i] = pcmData.readInt16LE(2 * i);
      fftNode.time[i] = pcmData.readInt16LE(2 * i);
    }
    if (overrun > 0) {
      let [, nextPcmData] = this._pcmDataQueue[0];
      for (let j = 0; j < overrun; j++, i++) {
        this._fftInput[i] = nextPcmData.readInt16LE(2 * j);
        fftNode.time[i] = nextPcmData.readInt16LE(2 * j);
      }
    }

    fft(this._fftInput, this._fftOutput, (err, result) => {
      if (err) {
        log.error('fft calculation error', err, result);
      }
      for (let i = 0; i < this._fftWindowSize + 2; i++) {
        fftNode.freq[i] = Math.abs(this._fftOutput[i]);
      }

      this.emit('fftDone', fftNode);
      if (this._audioDiag) {
        this._audioDiag.addFftNode(fftNode);
      }

      this._processNextFft();
    });
  }

  processSamples(when, pcmData) {
    if (pcmData.length < this._windowSizeInBytes) {
      // A humble ask!  pcmData is not copied while it's processed in
      // fftWindowStep/fftWindowSize chunks, and this limitation avoids the need
      // for logic to handle a window that spans more than 2 pcmData buffers.
      throw new Error(`Windows fragments are not supported.` +
        `Expecting length >= ${this._windowSizeInBytes} but got ${pcmData.length}`);
    }

    this._pcmDataQueue.push([when, pcmData]);
    this._pcmDataQueueSizeInBytes += pcmData.length;
    if (this._pcmDataQueueSizeInBytes >= this._backlogMinSizeInBytes) {
      let delta = process.hrtime(this._lastBacklogWarningTime );
      if (delta[0] >= 1) { // Cry once a second
        const backlogMs = this._pcmDataQueueSizeInBytes / this._fftWindowStep * this._fftWindowStepDurationMs;
        log.warn(`Warning: PCM data backlog of ${backlogMs}ms`);
        this._lastBacklogWarningTime = process.hrtime();
      }
    }

    if (!this._processingInProgress) {
      this._processingInProgress = true;
      this._processNextFft();
    }
  }

  cleanup() {
    if (this._audioDiag) {
      this._audioDiag.cleanup();
    }
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
  constructor(serverUrl, fftCfg) {
    super();
    this._listenerObjects = [];
    this._serverUrl = serverUrl;

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
      this.socket.emit('fft', fftNode);
    }
  }
}

module.exports = env => {
  log = env.log;
  util = env.util;
  return { WindowHistory, FftProcessor, AudioDiag, WavFileSaver };
};
