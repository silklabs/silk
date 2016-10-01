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

class ConvLayer extends Layer {
  constructor(filter_num, filter_size, filter_stride, filter_pad, eps, negative_slope) {
    super();
    this.filter_num = filter_num;
    this.filter_size = filter_size;
    this.filter_stride = filter_stride;
    this.filter_pad = filter_pad;
    this.eps = eps;
    this.negative_slope = negative_slope;
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
    if (means && variances && scales) {
      // Pre-calculate Math.sqrt(variances[c]) + eps) * scales[c]
      let variances_data = backend.download(variances);
      let scales_data = backend.download(scales);
      let scaled_inv_variance_sqrts_data = variances_data.map((val, c) => scales_data[c] * 1 / (Math.sqrt(val) + this.eps));
      let scaled_inv_variance_sqrts = new Blob(scales.shape);
      backend.upload(scaled_inv_variance_sqrts, scaled_inv_variance_sqrts_data);
      backend.release(variances);
      backend.release(scales);
      this.scaled_inv_variance_sqrts = scaled_inv_variance_sqrts;
      // Try to fold biases into means
      if (biases) {
        let means_data = backend.download(means);
        let biases_data = backend.download(biases);
        let biased_means = new Blob(means.shape);
        backend.upload(biased_means, means_data.map((val, c) => val - biases_data[c] / scaled_inv_variance_sqrts_data[c]));
        backend.release(means);
        backend.release(biases);
        means = biased_means;
        biases = null;
      }
      this.means = means;
    }
    if (biases) {
      this.biases = biases;
    }
  }

  forward(in_blob, out_blob) {
    this.net.backend.convolution(in_blob, out_blob,
                                 this.filter_num, this.filter_size, this.filter_stride, this.filter_pad,
                                 this.filters);
    if (this.means && this.scaled_inv_variance_sqrts) {
      assert(!this.biases); // biases should have folded into means already
      this.net.backend.normalize(out_blob, this.means, this.scaled_inv_variance_sqrts, this.negative_slope);
      return;
    }
    if (this.biases) {
      this.net.backend.bias(out_blob, this.biases, this.negative_slope);
    }
  }
}

class ActivationLayer extends Layer {
  constructor(type, param) {
    super();
    assert(type === 'relu');
    this.activation_param = param;
  }

  forward(in_blob, out_blob) {
    this.net.backend.relu(in_blob, out_blob, this.activation_param);
  }
}

class PoolingLayer extends Layer {
  constructor(filter_size, filter_stride, filter_pad, filter_type) {
    super();
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
    this.net.backend.maxPooling(in_blob, out_blob,
                                this.filter_size, this.filter_stride, this.filter_pad);
  }
}

class ConnectedLayer extends Layer {
  constructor(num_outputs, negative_slope) {
    super();
    this.num_outputs = num_outputs;
    this.negative_slope = negative_slope;
  }

  out_shape(in_shape) {
    return new Shape(in_shape.batch_size, this.num_outputs, 1, 1);
  }

  set(weights, biases) {
    this.weights = weights;
    this.biases = biases;
  }

  forward(in_blob, out_blob) {
    this.net.backend.fullyConnected(in_blob, out_blob, this.weights);
    this.net.backend.bias(out_blob, this.biases, this.negative_slope);
  }
}

module.exports = {
  Layer: Layer,
  ConvLayer: ConvLayer,
  ActivationLayer: ActivationLayer,
  PoolingLayer: PoolingLayer,
  ConnectedLayer: ConnectedLayer,
};
