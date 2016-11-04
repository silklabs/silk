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

// This will throw, preventing this backend to be used if NNPACK
// wasn't installed properly.
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

// Import some functionality from the reference backend
const reference = require('./reference');
const allocate = reference.allocate;
const upload = reference.upload;
const download = reference.download;
const release = reference.release;

// Perform a batch normalization on out_blob
function bias_and_scale(out_blob, biases_blob, scales_blob) {
  let biases = biases_blob.data;
  let scales = scales_blob.data;
  // Special case we hit when called for fully connected layers. Since
  // width and height are 1, channel data is adjacent and we can use
  // element-wise vector manipulation. The number of outputs of a
  // fully connected layer tends to be relatively small so we can
  // afford a pure JS implementation here.
  if (out_blob.spatial === 1) {
    let data = out_blob.data;
    data.forEach((v, c) => {
      data[c] = (v + biases[c]) * scales[c];
    });
    return;
  }
  out_blob.forEachChannel((channel_blob, _, c) => {
    let data = channel_blob.data;
    bias_vector(data, biases[c]);
    scale_vector(data, scales[c]);
  });
}

// Rectified linear units
function relu(in_blob, out_blob, negative_slope) {
  if (negative_slope === 1) {
    return;
  }
  assert(in_blob.shape.equals(out_blob.shape));
  let shape = out_blob.shape;
  nnpack.relu(shape.batch_size,
              shape.channels * shape.spatial,
              in_blob.data,
              out_blob.data,
              negative_slope);
}

// Perform a convolution over in_blob, storing the results in out_blob
function convolution(in_blob, out_blob,
                     filter_num, filter_size, filter_stride, filter_pad, filters,
                     biases_blob, scales_blob, negative_slope) {
  let in_shape = in_blob.shape;
  // biases is optional and if its not supplied, pass a zero biases to nnpack
  let zeroes = new Blob(new Shape(1, filter_num, 1, 1));
  upload(zeroes, new Float32Array(filter_num));
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
                       zeroes.data,
                       out_blob.getBlob(b).data);
  });
  release(zeroes);
  bias_and_scale(out_blob, biases_blob, scales_blob);
  relu(out_blob, out_blob, negative_slope);
}

// Fully connected layer
function fullyConnected(in_blob, out_blob,
                        weights,
                        biases_blob, scales_blob, negative_slope) {
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
  bias_and_scale(out_blob, biases_blob, scales_blob);
  relu(out_blob, out_blob, negative_slope);
}

// Max pooling
function maxPooling(in_blob, out_blob, filter_size, filter_stride, filter_pad, negative_slope) {
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
  relu(out_blob, out_blob, negative_slope);
}

module.exports = {
  name: 'NNPACK',
  allocate: allocate,
  upload: upload,
  download: download,
  release: release,
  convolution: convolution,
  fullyConnected: fullyConnected,
  maxPooling: maxPooling,
  softmax: reference.softmax,
  // other backends may want to re-use our relatively fast implementations
  // of bias_and_scale and relu
  bias_and_scale: bias_and_scale,
  relu: relu,
};
