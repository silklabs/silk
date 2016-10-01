/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

// This is the reference backend for nn.js. It uses pure JavaScript and is written
// to be readable, not fast

const assert = require('assert');
const blas = require('../math/blas');
const Shape = require('../shape');
const Blob = require('../blob');
const Profiler = require('../profiler');

// We put a reference to this helper on Blob when we allocate it so callers
// can create subBlobs from it.
function subBlobHelper(newShape, startOffset, stopOffset) {
  assert(newShape.size === stopOffset - startOffset);
  if (newShape.size === this.shape.size) { // identity
    return this;
  }
  let subBlob = new Blob(newShape);
  subBlob.data = this.data.subarray(startOffset, stopOffset);
  return subBlob;
}

// Allocate memory for a blob. Semantically this memory is assumed to be not
// initialized and should be written to by a kernel, or by upload(). Its an
// error to call allocate if the blob already has memory assigned to it.
function allocate(blob) {
  assert(!blob.data);
  blob.data = new Float32Array(blob.shape.size);
  blob.subBlob = subBlobHelper;
  Profiler.emit('allocate', { blob: blob });
}

// Upload memory into a blob. The blob should not be allocated yet. The data
// is copied into the blob, so data can be mutated after.
function upload(blob, data) {
  assert(blob.shape.size === data.length);
  allocate(blob);
  blob.data.set(data);
}

// Download data from this blob as a typed array
function download(blob) {
  assert(blob.data);
  return blob.data;
}

// Release the memory assigned to this blob
function release(blob) {
  assert(blob.data);
  blob.data = null;
  Profiler.emit('release', { blob: blob });
}

// Call a closure for each value in the blob
function forEach(blob, closure) {
  let shape = blob.shape;
  let batch_size = shape.batch_size;
  let channels = shape.channels;
  let height = shape.height;
  let width = shape.width;
  let data = blob.data;
  for (let b = 0; b < batch_size; ++b) {
    for (let c = 0; c < channels; ++c) {
      for (let y = 0; y < height; ++y) {
        let i = shape.index(b, c, y, 0);
        for (let x = 0; x < width; ++x, ++i) {
          closure(b, c, y, x, data, i);
        }
      }
    }
  }
}

function im2col(in_blob, filter_size, filter_stride, filter_pad) {
  let in_shape = in_blob.shape;
  assert(in_shape.batch_size === 1);
  let out_height = Math.floor((in_shape.height + 2 * filter_pad - filter_size) / filter_stride + 1);
  let out_width = Math.floor((in_shape.width + 2 * filter_pad - filter_size) / filter_stride + 1);
  let out_channels = in_shape.channels * filter_size * filter_size;
  let out_shape = new Shape(1, out_channels, out_height, out_width);
  let out_blob = new Blob(out_shape);
  allocate(out_blob);
  forEach(out_blob, (b, c, y, x, data, i) => {
    let in_c = Math.floor(Math.floor(c / filter_size) / filter_size);
    let in_y = (Math.floor(c / filter_size) % filter_size + y * filter_stride) - filter_pad;
    let in_x = (c % filter_size + x * filter_stride) - filter_pad;
    data[i] = in_shape.valid(b, in_c, in_y, in_x)
      ? in_blob.data[in_shape.index(b, in_c, in_y, in_x)]
      : 0; // padding
  });
  return out_blob;
}

// Perform a convolution over in_blob, storing the results in out_blob
function convolution(in_blob, out_blob,
                     filter_num, filter_size, filter_stride, filter_pad,
                     filters) {
  let col_blob = im2col(in_blob, filter_size, filter_stride, filter_pad);
  let M = filter_num;
  let N = out_blob.shape.spatial;
  let K = in_blob.shape.channels * filter_size * filter_size;
  in_blob.forEachBlob((in_blob, b) => {
    blas.sgemm(blas.NoTrans, blas.NoTrans, // no transpose
               M, N, K,
               1, // alpha
               filters.data, K, // a, lda
               col_blob.data, N, // b, ldb
               0, // beta
               out_blob.getBlob(b).data, N); // c, ldc
  });
  release(col_blob);
}

// Fully connected layer
function fullyConnected(in_blob, out_blob, weights) {
  let in_shape = in_blob.shape;
  let out_shape = out_blob.shape;
  let M = out_shape.batch_size;
  let N = out_shape.channels * out_shape.spatial;
  let K = in_shape.channels * in_shape.spatial;
  blas.sgemm(blas.NoTrans, blas.Trans,
             M, N, K,
             1, // alpha
             in_blob.data, K, // a, lda
             weights.data, K, // b, ldb (transposed)
             0, // beta
             out_blob.data, N); // c, ldc
}

// Perform a batch normalization on out_blob
function normalize(out_blob, means_blob, scales_blob, negative_slope) {
  let means = means_blob.data;
  let scales = scales_blob.data;
  forEach(out_blob, (b, c, y, x, data, i) => {
    data[i] = (data[i] - means[c]) * scales[c];
  });
  if (negative_slope !== 1) {
    relu(out_blob, out_blob, negative_slope);
  }
}

// Bias out_blob
function bias(out_blob, biases_blob, negative_slope) {
  let biases = biases_blob.data;
  forEach(out_blob, (b, c, y, x, data, i) => {
    data[i] += biases[c];
  });
  if (negative_slope !== 1) {
    relu(out_blob, out_blob, negative_slope);
  }
}

// Rectified linear units
function relu(in_blob, out_blob, negative_slope) {
  assert(in_blob.shape.equals(out_blob.shape));
  let out_data = out_blob.data;
  forEach(in_blob, (b, c, y, x, in_data, i) => {
    out_data[i] = Math.max(in_data[i], 0) + negative_slope * Math.min(in_data[i], 0);
  });
}

// Max pooling
function maxPooling(in_blob, out_blob, filter_size, filter_stride, filter_pad) {
  let in_shape = in_blob.shape;
  let in_data = in_blob.data;
  forEach(out_blob, (b, c, y, x, out_data, i) => {
    let max = -Infinity;
    for (let n = 0; n < filter_size; ++n) {
      for (let m = 0; m < filter_size; ++m) {
        let in_y = -filter_pad + y * filter_stride + n;
        let in_x = -filter_pad + x * filter_stride + m;
        let val = in_shape.valid(b, c, in_y, in_x)
              ? in_data[in_shape.index(b, c, in_y, in_x)]
              : -Infinity;
        max = Math.max(max, val);
      }
    }
    out_data[i] = max;
  });
}

module.exports = {
  name: 'Reference',
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
  // We expose our reference to BLAS so we can force a particular one during
  // testing
  blas: blas,
};
