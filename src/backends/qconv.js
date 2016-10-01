/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

'use strict';

const reference = require('./reference');
const nnpack = require('./nnpack');
const qsml = require('node-qsml');

// This backend uses QSML's "sconv_mm" extension to accelerate convolutions. Fully connected
// layers are sent via the reference backend to QSML's sgemv implementation.

function convolution(in_blob, out_blob,
                     filter_num, filter_size, filter_stride, filter_pad,
                     filters) {
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
}

module.exports = {
  name: 'qconv',
  allocate: reference.allocate,
  upload: reference.upload,
  download: reference.download,
  release: reference.release,
  convolution: convolution,
  fullyConnected: reference.fullyConnected,
  normalize: nnpack.normalize,
  bias: nnpack.bias,
  relu: nnpack.relu,
  maxPooling: nnpack.maxPooling,
};
