/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var assert = require('assert');

class Framer {
  constructor(stepSize, fftSize, process) {
    this.stepSize = stepSize;
    this.fftSize = fftSize;
    this.signal = new Float32Array(fftSize);
    this.signal_ptr = 0;
    this.process = process;
  }

  addData(data) {
    var signal = this.signal;
    var signal_ptr = this.signal_ptr;
    var fftSize = this.fftSize;
    var stepSize = this.stepSize;
    var data_length = data.length;
    for (var n = 0; n < data.length; ++n) {
      signal[signal_ptr++] = data[n];
      if (signal_ptr === fftSize) {
        this.process(signal);
        // reset the pointer into signal
        signal_ptr = stepSize;
        // move data to the bottom part of the buffer
        signal.set(signal.subarray(stepSize, fftSize), 0);
      }
    }
    this.signal_ptr = signal_ptr;
  }
}

module.exports = Framer;
