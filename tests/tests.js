/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * See LICENSE.
 */

'use strict';

const qsml = require('../.');
const nblas = require('nblas');

module.exports.test_gemm = test => {
  test.expect(4);
  const M = 4;
  const N = 2;
  const K = 3;
  let a = new Float32Array([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 17]);
  let b = new Float32Array([1, 2, 3, 4, 5, 6]);
  let c = new Float32Array(M * N);
  let c_ref = new Float32Array(M * N);

  function run(transpose_a, transpose_b) {
    nblas.sgemm(transpose_a ? nblas.Trans : nblas.NoTrans, transpose_b ? nblas.Trans : nblas.NoTrans,
                M, N, K,
                1, // alpha
                a, transpose_a ? M : K,
                b, transpose_b ? K : N,
                0, // beta
                c_ref, N);
    qsml.sgemm(transpose_a ? qsml.Trans : qsml.NoTrans, transpose_b ? qsml.Trans : qsml.NoTrans,
               M, N, K,
               1, // alpha
               a, transpose_a ? M : K,
               b, transpose_b ? K : N,
               0, // beta
               c, N);
    test.deepEqual(c, c_ref);
  }
  run(false, false);
  run(true, false);
  run(false, true);
  run(true, true);
  test.done();
};

module.exports.test_sscal = test => {
  test.expect(1);
  let ref = new Float32Array([1,2,3,4]);
  let a = new Float32Array(ref);
  qsml.sscal(4, 0.5, a, 1);
  test.deepEqual(a, ref.map(x => x/2));
  test.done();
}

module.exports.test_saxpy = test => {
  test.expect(1);
  let x = new Float32Array([1,2,3,4]);
  let y = new Float32Array([1,1,1,1]);
  qsml.saxpy(4, 0.5, x, 1, y, 1);
  test.deepEqual(y, new Float32Array([1.5, 2, 2.5, 3]));
  test.done();
}
