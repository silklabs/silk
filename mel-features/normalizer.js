'use strict';

class Normalizer {
  constructor() {
    this.min = +Infinity;
    this.max = -Infinity;
  }

  track(samples) {
    var s_min = Math.min.apply(null, samples);
    var s_max = Math.max.apply(null, samples);
    this.min = Math.min(this.min, s_min);
    this.max = Math.max(this.max, s_max);
    var range = this.max - this.min;
    this.scale = 2.0 / range;
    this.offset = -(this.max + this.min) / range;
  }

  apply(input, output) {
    var scale = this.scale;
    var offset = this.offset;
    for (var n = 0; n < output.length; ++n)
      output[n] = input[n] * scale + offset;
    return output;
  }
}

module.exports = Normalizer;
