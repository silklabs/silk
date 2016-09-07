/**
 * Trim a wav file and remove silence at the beginning and end.
 * node remove-silence.js input-file output-file
 *
 * @noflow
 */

'use strict';

// calculate the activity in a window of the data
function activity(data, offset, len) {
  let a = 0;
  for (let i = 0; i < len; ++i) {
    let s = data[offset + i] || 0.0;
    a += (s * s);
  }
  return a;
}

let WINDOW = 8;
let THRESHOLD = 0.01;

// trim voice data
function trim(data) {
  let samples = data.length;
  let windows = Math.floor(samples / WINDOW);
  let w = [];
  // determine the activity for each window
  for (let n = 0; n < windows; ++n) {
    w[n] = activity(data, n * WINDOW, WINDOW);
  }
  let max = Math.max.apply(null, w);
  // scale activity to [0, 1]
  w = w.map(v => v / max);
  // trim voice data at the beginning and end
  let startOffset, stopOffset;
  for (startOffset = 0; startOffset < windows; ++startOffset) {
    if (w[startOffset] > THRESHOLD) {
      break;
    }
  }
  for (stopOffset = windows - 1; stopOffset > 0; --stopOffset) {
    if (w[stopOffset] > THRESHOLD) {
      break;
    }
  }
  return data.slice(startOffset * WINDOW, stopOffset * WINDOW);
}

module.exports = trim;
