/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

'use strict';

const Shape = require('../src/shape');
const Blob = require('../src/blob');
const Net = require('../src/net');

const blas = require('../src/math/blas');

function delta(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; ++i) {
    d += Math.abs(a[i] - b[i]);
  }
  return d / a.length;
}

module.exports.test_quantization = test => {
  const testcases = [
    [1000, 1001.0, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009],
    [0, 0],
    [1000, 1000],
    [0.0000001, 0.0000002],
    [-5, 12],
  ];
  test.expect(testcases.length);
  testcases.forEach(data => {
    let reference = Net.backends.reference;
    let lowp = Net.backends.lowp;
    let f = new Blob(new Shape(1, 1, 1, data.length));
    reference.upload(f, data);
    let u = lowp.quantize(f);
    let f2 = lowp.dequantize(u);
    let error = f.data.map((a, i) => Math.abs(a - f2.data[i]));
    test.ok(!error.some((x, n) => x > Math.abs(f[n]) / 100));
  });
  test.done();
};

module.exports.test_gemm8 = test => {
  test.expect(1);
  const M = 4;
  const N = 2;
  const K = 3;
  let reference = Net.backends.reference;
  let lowp = Net.backends.lowp;
  let a = new Blob(new Shape(1, 1, 1, M * K));
  reference.upload(a, new Float32Array([0.7, 0.8, 0.9, 0.10, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17, 0.18]));
  let b = new Blob(new Shape(1, 1, 1, N * K));
  reference.upload(b, new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]));
  let c_ref = new Blob(new Shape(1, 1, 1, M * N));
  reference.allocate(c_ref);
  blas.sgemm(blas.NoTrans, blas.NoTrans,
             M, N, K,
             1, // alpha
             a.data, K,
             b.data, N,
             0,
             c_ref.data, N);
  let qa = lowp.quantize(a);
  let qb = lowp.quantize(b);
  let c = new Blob(c_ref.shape);
  reference.allocate(c); // result is float
  lowp.qgemm(false, false,
             M, N, K,
             qa, K,
             qb, N,
             c, N);
  test.ok(delta(c.data, c_ref.data) < 0.01);
  test.done();
};
