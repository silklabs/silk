/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

var kiss = require('./index');
var ref = require('fft').complex;

function compare(a, b) {
  for (var i = 0; i < a.length; ++i) {
    if (Math.abs(a[i] - b[i]) > 0.00001)
      return false;
  }
  return true;
}

function join(array, separator) {
  return Array.prototype.join.call(array, separator);
}

function test(name, input) {
  exports[name] = function(test) {
    var complex = [];
    input.forEach(function (r) {
      complex.push(r, 0);
    });
    var output = [];
    (new ref(input.length, false)).simple(output, complex, 'complex');
    test.expect(7);
    var syncResult = kiss.fftSync(new Float32Array(complex),
                             new Float32Array(output.length));
    test.ok(syncResult !== null);
    test.ok(compare(output, syncResult));
    kiss.fft(new Float32Array(complex), new Float32Array(output.length), function (err, result) {
      test.ok(!err);
      test.ok(compare(output, result));

      var syncResult_r = kiss.fftSync(new Float32Array(input),
                                      new Float32Array(input.length+2));
      // NB: the order of the arguments to `compare()` is important,
      // because `result_r` only contains the first half of the
      // transform; we only want to compare that half.
      test.ok(compare(syncResult_r, result));
      kiss.fft(new Float32Array(input), new Float32Array(input.length+2), function (err, result_r) {
        test.ok(!err);
        // See above about order of arguments.
        test.ok(compare(result_r, result));
        test.done();
      });
    });
  };
}

test('fft1', [1,2,3,4,5,6,7,8]);
