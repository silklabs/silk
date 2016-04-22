/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/*
 * Octave invocation used to compute the coefficients for the 6-th
 * order Butterworth band-pass filter below.
 *
 * >>> f_pass = 0.7
 * f_pass =  0.70000
 * >>> f_stop = 4
 * f_stop =  4
 * >>> sample_rate = 12
 * sample_rate =  12
 * >>> [B, A] = butter(6, [ f_pass, f_stop ] / (sample_rate/2))
*/

// Range 0.7 (42bpm) - 4 (240bpm)
const B = [
  0.0464, 0.0000, -0.2783, 0.0000, 0.6959, 0.0000, -0.9278, 0.0000, 0.6959,
  0.0000, -0.2783, 0.0000, 0.0464
];
const A = [
  1.0000, -2.7789, 2.8255, -1.7731, 1.9918, -2.0298, 0.8962, -0.2323, 0.2292,
  -0.1205, 0.0017, 0.0029, 0.0025
];

/**
 * Butterworth band-pass filter the given input data `x` (already normalized)
 * using coefficients `b` and `a` according to the following formula:
 *
 *                 N                   M
 * y(n) = - SUM c(k+1) y(n-k) + SUM d(k+1) x(n-k)  for 1<=n<=length(x)
 *                k=1                 k=0
 *
 * where c = a/a(1) and d = b/a(1)
 */
export default function bandPassFilter(x, b = B, a = A) {
  // BEWARE: the formula above uses 1-based FORTRAN indexes, but we're
  // using 0-based C indexes here.
  let si = new Array(b.length - 1);
  si.fill(0);

  // TODO: cached window of filtered results
  let y = new Array(x.length);
  y.fill(0);

  for (let i = 0; i < x.length; ++i) {
    y[i] = si[0] + b[0] * x[i];
    for (let j = 0; j < si.length - 1; ++j) {
      si[j] = si[j + 1] - a[j + 1] * y[i] + b[j + 1] * x[i];
    }
    si[si.length - 1] = b[si.length] * x[i] - a[si.length] * y[i];
  }
  return y;
}
