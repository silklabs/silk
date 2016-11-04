/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const ProtoBuf = require('protobufjs');
const TextFormat = require('protobuf-textformat');
const IO = require('./io');

const Shape = require('../src/shape');
const Blob = require('../src/blob');
const Net = require('../src/net');
const ConvLayer = require('../src/layers').ConvLayer;
const ConnectedLayer = require('../src/layers').ConnectedLayer;
const PoolingLayer = require('../src/layers').PoolingLayer;
const SoftmaxLayer = require('../src/layers').SoftmaxLayer;

let builder = ProtoBuf.loadProtoFile(__dirname + '/caffe.proto');

function parseShape(shape) {
  assert('dim' in shape);
  assert(!shape.dim.some(num => num.high || num.unsigned));
  let dim = shape.dim.map(long => long.low);
  // ignore batch_size
  return new Shape(1, dim[1], dim[2], dim[3]);
}

function parseSize(size) {
  if (size.length === 0) {
    return 0;
  }
  assert(size.length === 1);
  return size[0];
}

function loadModel(modelfile, weightsfile, backend) {
  let text = fs.readFileSync(modelfile, 'utf-8');
  let deploy = TextFormat.parse(builder, 'caffe.NetParameter', text);
  let buffer = IO.readFileSync(weightsfile);
  let root = builder.build('caffe.NetParameter');
  let weights = root.decode(buffer);
  let net = null;

  function addLayer(name, layer) {
    net.addLayer(layer);
    return layer;
  }

  function last() {
    return net.out_layer;
  }

  function relu(negative_slope) {
    assert(negative_slope !== 1);
    assert(last().negative_slope === 1);
    last().negative_slope = negative_slope;
  }

  function blobs_for(model_layer) {
    return weights.layer.filter(layer => layer.name === model_layer.name)[0].blobs;
  }

  function layer_count_check(layer_counts, layer_type) {
    layer_counts[layer_type]++;
    assert(layer_counts[layer_type] <= 1);
  }

  function process_aux_layers(parent_layer, parent_layer_data, layer_group, shape) {
    // Convolution and FullyConnected layers can have the following layers
    // 'folded' into them
    // BatchNorm --> means, variances, eps
    // Scale     --> scales
    // Bias      --> biases
    // ReLU      --> set negative_slope if it is defined otherwise set to 0
    let layer_counts = {
      BatchNorm: 0,
      Bias: 0,
      Scale: 0,
      ReLU: 0,
    };
    let aux = {};
    // parent layer (Convolution or Inner Product) can have additional biases
    // stored in it separate from a Bias Layer, so need to check for those
    let parent_bias_data;
    if (blobs_for(parent_layer_data)[1]) {
      parent_bias_data = blobs_for(parent_layer_data)[1].data;
      assert(parent_bias_data.length === shape.channels);
    }
    while (layer_group.length > 0) {
      let layer = layer_group.shift();
      layer_count_check(layer_counts, layer.type);
      if (layer.type === 'BatchNorm') {
        aux.means = new Blob(shape);
        aux.variances = new Blob(shape);
        // BatchNorm layer also gives eps value
        let [means_data, variances_data, eps] = aux_handlers[layer.type](layer);
        parent_layer.eps0 = eps;
        parent_layer.eps1 = 0;
        net.backend.upload(aux.means, means_data);
        net.backend.upload(aux.variances, variances_data);
      } else if (layer.type === 'Bias') {
        aux.biases = new Blob(shape);
        let biases_data = aux_handlers[layer.type](layer);
        if (parent_bias_data) {
          // if the parent layer (Convolution or Inner Product) has biases stored
          // in it already, need to combine those with biases from this layer
          biases_data = biases_data.map((v, n) => v + parent_bias_data[n]);
        }
        net.backend.upload(aux.biases, biases_data);
      } else if (layer.type === 'Scale') {
        aux.scales = new Blob(shape);
        let scales_data = aux_handlers[layer.type](layer);
        net.backend.upload(aux.scales, scales_data);
      } else if (layer.type === 'ReLU') {
        aux_handlers[layer.type](layer);
      } else {
        assert(false);
      }
    }
    if (!aux.biases && parent_bias_data) {
      // if the parent layer (Convolution or Inner Product) has biases stored
      // and there was NOT a separate Bias layer being folded in, need to store
      // the parent layer biases
      aux.biases = new Blob(shape);
      net.backend.upload(aux.biases, parent_bias_data);
    }
    return aux;
  }

  const handlers = {
    BufferedData: layer_group => {
      // BufferedData layer should be only layer in its group
      assert(layer_group.length === 1);
      let layer = layer_group.shift();
      let p = layer.input_param;
      let in_shape = parseShape(p.shape[0]);
      net = new Net(in_shape, backend);
    },
    Convolution: layer_group => {
      let layer = layer_group.shift();
      let p = layer.convolution_param;
      assert(!p.bias_term);
      assert(!p.kernel_h && !p.kernel_w);
      assert(!p.stride_h && !p.stride_w);
      assert(!p.pad_h && !p.pad_w);
      assert(!p.dilation.length);
      assert(!p.group);
      assert(!p.force_nd_im2col);
      assert(!p.axis);
      let in_shape = net.out_shape();
      let l = addLayer(layer.name, new ConvLayer(p.num_output, parseSize(p.kernel_size), parseSize(p.stride), parseSize(p.pad)));
      let filters = new Blob(new Shape(1, p.num_output, 1, in_shape.channels * l.filter_size * l.filter_size));
      net.backend.upload(filters, blobs_for(layer)[0].data);

      let aux = process_aux_layers(l, layer, layer_group, new Shape(1, p.num_output, 1, 1));
      l.set(filters, aux.biases, aux.means, aux.variances, aux.scales);
    },
    InnerProduct: layer_group => {
      let layer = layer_group.shift();
      let p = layer.inner_product_param;
      assert(p.num_output);
      assert(!p.bias_term && !p.axis && !p.transpose);
      let in_shape = net.out_shape();
      let l = addLayer(layer.name, new ConnectedLayer(p.num_output));
      let weights = new Blob(new Shape(1, l.num_outputs, 1, in_shape.channels * in_shape.height * in_shape.width));
      net.backend.upload(weights, blobs_for(layer)[0].data);

      let aux = process_aux_layers(l, layer, layer_group, new Shape(1, p.num_output, 1, 1));
      l.set(weights, aux.biases, aux.scales);
    },
    Pooling: layer_group => {
      let layer = layer_group.shift();
      let p = layer.pooling_param;
      assert(p.pool === 0); // max
      assert(!p.kernel_h && !p.kernel_w);
      assert(!p.stride_h && !p.stride_w);
      assert(!p.pad_h && !p.pad_w);
      addLayer(layer.name, new PoolingLayer(p.kernel_size | 0, p.stride | 0, p.pad | 0, 'max'));
      // need to also add in following layers if they exist
      // ReLU      --> negative_slope set to 0
      let layer_counts = {
        ReLU: 0,
      };
      while (layer_group.length > 0) {
        let layer = layer_group.shift();
        layer_count_check(layer_counts, layer.type);
        if (layer.type === 'ReLU') {
          aux_handlers[layer.type](layer);
        } else {
          assert(false);
        }
      }
    },
    Softmax: layer_group => {
      // Softmax layer should be only layer in its group
      assert(layer_group.length === 1);
      let layer = layer_group.shift();
      addLayer(layer.name, new SoftmaxLayer());
    },
  };

  const aux_handlers = {
    BatchNorm: layer => {
      let p = layer.batch_norm_param;
      assert(p.eps);
      let in_shape = net.out_shape();
      let [means, variances, scale_factor] = blobs_for(layer).map(blob => blob.data);
      assert(means.length === in_shape.channels);
      assert(variances.length === in_shape.channels);
      assert(scale_factor.length === 1);
      // apply stored scale factor to means & variances
      scale_factor = (scale_factor === 0) ? 0 : (1 / scale_factor);
      means = means.map(m => m * scale_factor);
      variances = variances.map(v => v * scale_factor);
      return [means, variances, p.eps];
    },
    Scale: layer => {
      let in_shape = net.out_shape();
      let scales = blobs_for(layer)[0].data;
      assert(scales.length === in_shape.channels);
      return scales;
    },
    Bias: layer => {
      let in_shape = net.out_shape();
      let biases = blobs_for(layer)[0].data;
      assert(biases.length === in_shape.channels);
      return biases;
    },
    ReLU: layer => {
      if (layer.relu_param) {
        relu(layer.relu_param.negative_slope);
      } else {
        relu(0);
      }
    },
  };

  handlers.Input = handlers.BufferedData;

  // group layers together into buckets where subsequent layers can be
  // 'folded in' to a previous layer
  let layer_grouping = [];
  while (deploy.message.layer.length > 0) {
    let layer = deploy.message.layer.shift();
    if (layer.type in handlers) {
      let new_layer_group = [];
      new_layer_group.push(layer);
      layer_grouping.push(new_layer_group);
    } else {
      layer_grouping[layer_grouping.length - 1].push(layer);
    }
  }

  layer_grouping.forEach(layer_group => {
    handlers[layer_group[0].type](layer_group);
  });

  return net;
}

module.exports = {
  loadModel: loadModel,
};
