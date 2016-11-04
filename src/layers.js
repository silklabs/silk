/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

'use strict';

const assert = require('assert');
const Shape = require('./shape');
const Blob = require('./blob');

// The base class for all our layers
class Layer {
  constructor() {
    this.in_layer = null;
  }

  get type() {
    return Object.getPrototypeOf(this).constructor.name;
  }

  // by default a layer produces the same shape blob as the input layer
  out_shape(in_shape) {
    return in_shape;
  }

  // by default a layer needs no weights
  load(in_shape, loadBlob) {
  }

  toString() {
    return 'Layer (type=' + this.type + ')';
  }
}

// A layer that may apply an activation function after processing
class ActivatableLayer extends Layer {
  constructor(negative_slope) {
    super();
    this.negative_slope = (typeof negative_slope === 'undefined') ? 1 : negative_slope;
  }
}

class ConvLayer extends ActivatableLayer {
  constructor(filter_num, filter_size, filter_stride, filter_pad, eps0, eps1, negative_slope) {
    super(negative_slope);
    this.filter_num = filter_num;
    this.filter_size = filter_size;
    this.filter_stride = filter_stride;
    this.filter_pad = filter_pad;
    this.eps0 = eps0;
    this.eps1 = eps1;
  }

  out_shape(in_shape) {
    let filter_num = this.filter_num;
    let filter_size = this.filter_size;
    let filter_stride = this.filter_stride;
    let filter_pad = this.filter_pad;
    return new Shape(in_shape.batch_size,
                     filter_num,
                     Math.floor((in_shape.height + 2 * filter_pad - filter_size) / filter_stride + 1),
                     Math.floor((in_shape.width + 2 * filter_pad - filter_size) / filter_stride + 1));
  }

  set(filters, biases, means, variances, scales) {
    let backend = this.net.backend;
    this.filters = filters;
    if (!scales) {
      let shape = filters.shape;
      scales = new Blob(new Shape(1, shape.channels, 1, 1));
      let scales_data = new Float32Array(scales.shape.size);
      scales_data.fill(1);
      this.net.backend.upload(scales, scales_data);
    }
    if (!biases) {
      let shape = filters.shape;
      biases = new Blob(new Shape(1, shape.channels, 1, 1));
      let biases_data = new Float32Array(biases.shape.size);
      biases_data.fill(0);
      this.net.backend.upload(biases, biases_data);
    }
    if (means && variances && scales) {
      // Pre-calculate Math.sqrt(variances[c]) + eps) * scales[c]
      let variances_data = backend.download(variances);
      let scales_data = backend.download(scales);
      let scaled_inv_variance_sqrts_data = variances_data.map((val, c) => scales_data[c] * 1 / (Math.sqrt(val + this.eps0) + this.eps1));
      let scaled_inv_variance_sqrts = new Blob(scales.shape);
      backend.upload(scaled_inv_variance_sqrts, scaled_inv_variance_sqrts_data);
      backend.release(variances);
      backend.release(scales);
      scales = scaled_inv_variance_sqrts;
      // Fold means into the bias
      let means_data = backend.download(means);
      let biases_data = backend.download(biases);
      let biases_and_means = new Blob(means.shape);
      backend.upload(biases_and_means, biases_data.map((val, c) => val / scaled_inv_variance_sqrts_data[c] - means_data[c]));
      backend.release(means);
      backend.release(biases);
      biases = biases_and_means;
    }
    this.biases = biases;
    this.scales = scales;
  }

  forward(in_blob, out_blob) {
    this.net.backend.convolution(in_blob, out_blob,
                                 this.filter_num, this.filter_size, this.filter_stride, this.filter_pad,
                                 this.filters,
                                 this.biases, this.scales, this.negative_slope);
  }
}

class PoolingLayer extends ActivatableLayer {
  constructor(filter_size, filter_stride, filter_pad, filter_type, negative_slope) {
    super(negative_slope);
    this.filter_size = filter_size;
    this.filter_stride = filter_stride;
    this.filter_pad = filter_pad;
    this.filter_type = filter_type;
    assert(filter_type === 'max');
  }

  out_shape(in_shape) {
    let filter_size = this.filter_size;
    let filter_stride = this.filter_stride;
    let filter_pad = this.filter_pad;
    return new Shape(in_shape.batch_size,
                     in_shape.channels,
                     Math.floor((in_shape.height + 2 * filter_pad - filter_size + 1) / filter_stride) + 1,
                     Math.floor((in_shape.width + 2 * filter_pad - filter_size + 1) / filter_stride) + 1);
  }

  forward(in_blob, out_blob) {
    this.net.backend.maxPooling(in_blob, out_blob, this.filter_size, this.filter_stride, this.filter_pad, this.negative_slope);
  }
}

class ConnectedLayer extends ActivatableLayer {
  constructor(num_outputs, negative_slope) {
    super(negative_slope);
    this.num_outputs = num_outputs;
  }

  out_shape(in_shape) {
    return new Shape(in_shape.batch_size, this.num_outputs, 1, 1);
  }

  set(weights, biases, scales) {
    this.weights = weights;
    if (!scales) {
      let shape = weights.shape;
      scales = new Blob(new Shape(1, shape.channels, 1, 1));
      let scales_data = new Float32Array(scales.shape.size);
      scales_data.fill(1);
      this.net.backend.upload(scales, scales_data);
    }
    if (!biases) {
      let shape = weights.shape;
      biases = new Blob(new Shape(1, shape.channels, 1, 1));
      let biases_data = new Float32Array(biases.shape.size);
      biases_data.fill(0);
      this.net.backend.upload(biases, biases_data);
    }
    this.biases = biases;
    this.scales = scales;
  }

  forward(in_blob, out_blob) {
    this.net.backend.fullyConnected(in_blob, out_blob, this.weights, this.biases, this.scales, this.negative_slope);
  }
}

class SoftmaxLayer extends Layer {
  forward(in_blob, out_blob) {
    this.net.backend.softmax(in_blob, out_blob);
  }
}

module.exports = {
  Layer: Layer,
  ConvLayer: ConvLayer,
  PoolingLayer: PoolingLayer,
  ConnectedLayer: ConnectedLayer,
  SoftmaxLayer: SoftmaxLayer,
};
