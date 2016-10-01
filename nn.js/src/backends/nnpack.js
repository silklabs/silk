/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

'use strict';

const assert = require('assert');
const Shape = require('../shape');
const Blob = require('../blob');
const blas = require('../math/blas');

// This will throw, preventing this backend to be used if NNPACK wasn't installed
// properly.
const nnpack = require('node-nnpack');

// A couple helpers that use BLAS where NNPACK misses some functionality.

// x[i] = x[i] * s
function scale_vector(x, s) {
  // sscal(n, alpha, X, incX): X[i * incX] = X[i * incX] * alpha
  blas.sscal(x.length, s, x, 1);
}

// x[i] = x[i] + b
function bias_vector(x, b) {
  // saxpy(n, alpha, X, incX, Y, incY): Y[i] = (alpha * X[i * incX]) + Y[i * incY]
  let t = new Float32Array(1);
  t[0] = b;
  blas.saxpy(x.length, 1, t, 0, x, 1);
}

// x[i] = x[i] + y[i]
function vector_add(x, y) {
  assert(x.length === y.length);
  blas.saxpy(x.length, 1, y, 1, x, 1);
}

// Import some functionality from the reference backend
const reference = require('./reference');
const allocate = reference.allocate;
const upload = reference.upload;
const download = reference.download;
const release = reference.release;

// Perform a convolution over in_blob, storing the results in out_blob
function convolution(in_blob, out_blob,
                     filter_num, filter_size, filter_stride, filter_pad,
                     filters) {
  let in_shape = in_blob.shape;
  // biases is optional and if its not supplied, pass a zero biases to nnpack
  let biases = new Blob(new Shape(1, filter_num, 1, 1));
  upload(biases, new Float32Array(filter_num));
  // convolutions for each blob in the batch
  in_blob.forEachBlob((in_blob, b) => {
    nnpack.convolution(in_shape.channels,
                       filter_num,
                       in_shape.width,
                       in_shape.height,
                       filter_pad, filter_pad, filter_pad, filter_pad,
                       filter_size, filter_size,
                       filter_stride, filter_stride,
                       in_blob.data,
                       filters.data,
                       biases.data,
                       out_blob.getBlob(b).data);
  });
  release(biases);
}

// Fully connected layer
function fullyConnected(in_blob, out_blob, weights) {
  let in_shape = in_blob.shape;
  let out_shape = out_blob.shape;
  let inputs = in_shape.channels * in_shape.spatial;
  let outputs = out_shape.channels * out_shape.spatial;
  in_blob.forEachBlob((in_blob, b) => {
    nnpack.fullyConnected(inputs,
                          outputs,
                          in_blob.data,
                          weights.data,
                          out_blob.getBlob(b).data);
  });
}

// Perform a batch normalization on out_blob
function normalize(out_blob, means_blob, scales_blob, negative_slope) {
  let means = means_blob.data;
  let scales = scales_blob.data;
  out_blob.forEachChannel((channel_blob, _, c) => {
    let data = channel_blob.data;
      // batch normalization
    bias_vector(data, -means[c]);
    scale_vector(data, scales[c]);
  });
  if (negative_slope !== 1) {
    relu(out_blob, out_blob, negative_slope);
  }
}

// Bias out_blob
function bias(out_blob, biases_blob, negative_slope) {
  let biases = biases_blob.data;
  // Special case we hit when called for fully connected layers. Since
  // width and height are 1, channel data is adjacent and we can use a
  // straight up vector addition.
  if (out_blob.spatial === 1) {
    vector_add(out_blob.data, biases);
    return;
  }
  out_blob.forEachChannel((channel_blob, _, c) => {
    bias_vector(channel_blob.data, biases[c]);
  });
  if (negative_slope !== 1) {
    relu(out_blob, out_blob, negative_slope);
  }
}

// Rectified linear units
function relu(in_blob, out_blob, negative_slope) {
  assert(in_blob.shape.equals(out_blob.shape));
  let shape = out_blob.shape;
  nnpack.relu(shape.batch_size,
              shape.channels * shape.spatial,
              in_blob.data,
              out_blob.data,
              negative_slope);
}

// Max pooling
function maxPooling(in_blob, out_blob, filter_size, filter_stride, filter_pad) {
  let in_shape = in_blob.shape;
  nnpack.maxPooling(in_shape.batch_size,
                    in_shape.channels,
                    in_shape.width,
                    in_shape.height,
                    filter_pad, filter_pad, filter_pad, filter_pad,
                    filter_size, filter_size,
                    filter_stride, filter_stride,
                    in_blob.data,
                    out_blob.data);
}

module.exports = {
  name: 'NNPACK',
  allocate: allocate,
  upload: upload,
  download: download,
  release: release,
  convolution: convolution,
  fullyConnected: fullyConnected,
  normalize: normalize,
  bias: bias,
  relu: relu,
  maxPooling: maxPooling,
};
