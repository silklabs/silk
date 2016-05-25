# kissfft

FFT for node using kissfft.

Usage:

```javascript
var fft = require('kissfft').fft;

// Input is 1+0i 2+0i 3+0i 4+0i
var input = Float32Array([1, 0, 2, 0, 3, 0, 4, 0]);
var output = Float32Array(input.length);

// input and output must be exactly the same length, must both have an even
// number of elements, and must both be Float32Arrays.
fft(input, output, callback (err, result) {
  // result === output
});
```

If your input consists of real values only, kissfft supports a faster mode
that will calculate half the bins (plus the Nyquist frequency).

```javascript
var fft = require('kissfft').fft;

var input = Float32Array([1, 2, 3, 4]);
var output = Float32Array(input.length + 2);

// output must have exactly two elements more than input and input must
// have an even number of elements.
fft(input, output, callback (err, result) {
  // result === output
});
```

Inverse FFT is not currently supported because I didn't need it. Patches welcome.
