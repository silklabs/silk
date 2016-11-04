/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

'use strict';

const assert = require('assert');

// Reference BLAS implementation
let blas = {
  name: 'Reference',

  NoTrans: 111,
  Trans: 112,

  // sscal(n, alpha, X, incX): X[i * incX] = X[i * incX] * alpha
  sscal: function(N, alpha, X, incX) {
    for (let i = 0; i < N; ++i) {
      X[i * incX] *= alpha;
    }
  },

  // saxpy(n, alpha, X, incX, Y, incY): Y[i * incY] = (alpha * X[i * incX]) + Y[i * incY]
  saxpy: function(N, alpha, X, incX, Y, incY) {
    for (let i = 0; i < N; ++i) {
      Y[i * incY] += alpha * X[i * incX];
    }
  },

  // Matrix multiplication with optional transpose for A and B
  sgemm: function(
    transpose_a,
    transpose_b,
    M, N, K,
    alpha,
    a, lda,
    b, ldb,
    beta,
    c, ldc
  ) {
    assert(transpose_a === blas.NoTrans || transpose_a === blas.Trans);
    assert(transpose_b === blas.NoTrans || transpose_b === blas.Trans);
    assert(a.length === M * K);
    assert(b.length === N * K);
    assert(c.length === M * N);

    let a_k_stride = (transpose_a === blas.NoTrans) ? 1 : lda;
    let a_m_stride = (transpose_a === blas.NoTrans) ? lda : 1;
    let b_n_stride = (transpose_b === blas.NoTrans) ? 1 : ldb;
    let b_k_stride = (transpose_b === blas.NoTrans) ? ldb : 1;

    for (let m = 0; m < M; ++m) {
      for (let n = 0; n < N; ++n) {
        const c_index = m * ldc + n;
        let total = c[c_index] * beta;
        for (let k = 0; k < K; ++k) {
          const a_index = k * a_k_stride + m * a_m_stride;
          const b_index = n * b_n_stride + k * b_k_stride;
          assert(a_index < a.length);
          assert(b_index < b.length);
          assert(c_index < c.length);
          total += a[a_index] * b[b_index];
        }
        c[c_index] = total * alpha;
      }
    }
  },
};

// Try using nblas if its available
try {
  blas = require('nblas');
  blas.name = 'Native BLAS';
} catch (e) { }

// Try using QSML if its available
try {
  blas = require('node-qsml');
  blas.name = 'QSML BLAS';
} catch (e) { }

module.exports = blas;
