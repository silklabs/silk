/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

'use strict';

const nnpack = require('./nnpack');
const qsml = require('node-qsml');

// This backend uses QSML's "sconv_mm" extension to accelerate convolutions.

function convolution(in_blob, out_blob,
                     filter_num, filter_size, filter_stride, filter_pad, filters,
                     biases_blob, scales_blob, negative_slope) {
  in_blob.forEachBlob((in_blob, b) => {
    let in_shape = in_blob.shape;
    qsml.sconv(false,
               in_blob.data,
               in_shape.width,
               in_shape.height,
               in_shape.channels,
               filters.data,
               filter_num,
               filter_size,
               filter_size,
               filter_pad,
               filter_pad,
               filter_stride,
               filter_stride,
               out_blob.getBlob(b).data);
  });
  nnpack.bias_and_scale(out_blob, biases_blob, scales_blob);
  if (negative_slope !== 1) {
    nnpack.relu(out_blob, out_blob, negative_slope);
  }
}

module.exports = {
  name: 'qconv',
  allocate: nnpack.allocate,
  upload: nnpack.upload,
  download: nnpack.download,
  release: nnpack.release,
  convolution: convolution,
  fullyConnected: nnpack.fullyConnected,
  maxPooling: nnpack.maxPooling,
  softmax: nnpack.softmax,
};
