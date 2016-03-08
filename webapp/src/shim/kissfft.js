import { KissFFTR } from 'external-js-kissfft';

let fftCache = { };

function fft(input, output, callback) {
  fftSync(input, output);
  callback(null, output);
}

function fftSync(input, output) {
  if (input.length + 2 !== output.length) {
    throw 'Mismatch of array length for input and output';
  }
  if (output.length & 1) {
    throw 'Output array must have an even number of elements';
  }
  if (!(input.length in fftCache)) {
    fftCache[input.length] = new KissFFTR(input.length);
  }
  let fft = fftCache[input.length];
  // This is kind of lollerskates expensive ...
  let out = fft.forward(input);
  // We can't assume what `output` is.
  for (let i = 0; i < output.length; ++i) {
    output[i] = out[i];
  }
  return output;
}

module.exports = { fft, fftSync };
