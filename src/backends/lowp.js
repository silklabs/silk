/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

'use strict';

const assert = require('assert');
const Blob = require('../blob');
const Profiler = require('../profiler');
const reference = require('./reference');
const gemmlowp = require('gemmlowp');

// Allocate quantized memory for this blob (8-bit, unsigned)
function allocate(blob) {
  assert(!blob.data);
  blob.data = new Uint8Array(blob.shape.size);
  blob.backend = module.exports;
  Profiler.emit('allocate', { blob: blob });
}

// Set scale and offset from the given min and max values
function setOffsetAndScale(blob, min, max) {
  // we use a trick from tensorflow here to prevent creating very large
  // offsets and scales
  let eps = Math.max(1, Math.max(Math.abs(min), Math.abs(max))) / 100;
  max = Math.max(max, min + eps);
  let levels = (1 << 8);
  let scale = ((max - min) / (levels - 1));
  blob.q_offset = min / scale;
  blob.q_scale = scale;
}

// Quantize a blob that contains 32-bit floating point data into a blob
// that contains 8-bit unsigned integers.
function quantize(in_blob) {
  assert(in_blob.data && in_blob.data instanceof Float32Array);
  // allocate a quantized out_blob that we will write to
  let out_blob = new Blob(in_blob.shape);
  allocate(out_blob);
  // we don't want to make changes to the in_blob data, so make a copy
  let input = new Float32Array(in_blob.data.length);
  input.set(in_blob.data);
  let min = gemmlowp.min(input);
  let max = gemmlowp.max(input);
  setOffsetAndScale(out_blob, min, max);
  let scale = out_blob.q_scale;
  let offset = out_blob.q_offset;
  // quantize the data and store in out_blob
  gemmlowp.scale(input, 1 / scale);
  gemmlowp.bias(input, -offset);
  gemmlowp.roundToUint8(input, out_blob.data);
  return out_blob;
}

// Dequantize a blob
function dequantize(in_blob) {
  assert(in_blob.data && in_blob.data instanceof Uint8Array);
  let out_blob = new Blob(in_blob.shape);
  // the reference implementation knows how to allocate regular floating point blobs
  reference.allocate(out_blob);
  let out_data = out_blob.data;
  gemmlowp.convertToFloat(in_blob.data, out_data);
  gemmlowp.bias(out_data, in_blob.q_offset);
  gemmlowp.scale(out_data, in_blob.q_scale);
  return out_blob;
}

// Multiply two quantized blobs and produce a floating point blob
function qgemm(
  transpose_a, transpose_b,
  M, N, K,
  a, lda,
  b, ldb,
  c, ldc
) {
  let c_32 = new Int32Array(c.data.length);
  gemmlowp.gemm8(transpose_a, transpose_b,
                 M, N, K,
                 a.data, K,
                 b.data, N,
                 c_32, N,
                 a.q_offset | 0, // a_offset
                 b.q_offset | 0); // b_offset
  gemmlowp.convertToFloat(c_32, c.data);
  gemmlowp.scale(c.data, a.q_scale * b.q_scale);
}

// Fully connected layer
function fullyConnected(in_blob, out_blob, weights) {
  let in_shape = in_blob.shape;
  let out_shape = out_blob.shape;
  let M = out_shape.batch_size;
  let N = out_shape.channels * out_shape.spatial;
  let K = in_shape.channels * in_shape.spatial;
  let qa = quantize(in_blob);
  let qb = quantize(weights);
  qgemm(false, true,
        M, N, K,
        qa, K,
        qb, K,
        out_blob, N);
}

module.exports = {
  name: '8-bit fixed point CPU backend',
  allocate: reference.allocate,
  upload: reference.upload,
  download: reference.download,
  release: reference.release,
  convolution: reference.convolution,
  fullyConnected: fullyConnected,
  normalize: reference.normalize,
  bias: reference.bias,
  relu: reference.relu,
  maxPooling: reference.maxPooling,
  // expose our quantization functions so we can unit test them
  quantize: quantize,
  dequantize: dequantize,
  qgemm: qgemm,
};
