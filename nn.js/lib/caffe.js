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
const Net = require('../src/net');
const ConvLayer = require('../src/layers').ConvLayer;
const PoolingLayer = require('../src/layers').PoolingLayer;
const ActivationLayer = require('../src/layers').ActivationLayer;
const ConnectedLayer = require('../src/layers').ConnectedLayer;

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

function loadModel(filename, backend) {
  let text = fs.readFileSync(filename, 'utf-8');
  let deploy = TextFormat.parse(builder, 'caffe.NetParameter', text);
  let net;

  function addLayer(name, layer) {
    net.layer_map[name] = net.addLayer(layer);
  }

  const handlers = {
    BufferedData: layer => {
      let p = layer.input_param;
      let in_shape = parseShape(p.shape[0]);
      net = new Net(in_shape, backend);
      net.layer_map = {};
    },
    Convolution: layer => {
      let p = layer.convolution_param;
      assert(!p.bias_term);
      assert(!p.kernel_h && !p.kernel_w);
      assert(!p.stride_h && !p.stride_w);
      assert(!p.pad_h && !p.pad_w);
      assert(!p.dilation.length);
      assert(!p.group);
      assert(!p.force_nd_im2col);
      assert(!p.axis);
      addLayer(layer.name, new ConvLayer(p.num_output, parseSize(p.kernel_size), parseSize(p.stride), parseSize(p.pad)));
    },
    Pooling: layer => {
      let p = layer.pooling_param;
      assert(p.pool === 0); // max
      assert(!p.kernel_h && !p.kernel_w);
      assert(!p.stride_h && !p.stride_w);
      assert(!p.pad_h && !p.pad_w);
      addLayer(layer.name, new PoolingLayer(p.kernel_size | 0, p.stride | 0, p.pad | 0, 'max'));
    },
    ReLU: layer => {
      assert(!layer.relu_param);
      addLayer(layer.name, new ActivationLayer('relu', 0));
    },
    InnerProduct: layer => {
      let p = layer.inner_product_param;
      assert(p.num_output);
      assert(!p.bias_term && !p.axis && !p.transpose);
      addLayer(layer.name, new ConnectedLayer(p.num_output));
    },
    SoftmaxWithLoss: layer => {
      // ignore
    },
    LRN: layer => {
      // todo
    },
  };
  handlers.Input = handlers.BufferedData;
  deploy.message.layer.forEach(layer => {
    console.log(layer.type);
    handlers[layer.type](layer);
  });
  return net;
}

function loadWeights(net, filename) {
  // pick up the layer map loadModel() left for us
  net.layer_map = null;
  // parse the caffemodel and load the weights
  let buffer = IO.readFileSync(filename);
  let root = builder.build('caffe.NetParameter');
  let weights = root.decode(buffer);
  weights.layer.forEach(layer => {
  });
}

let net = loadModel(__dirname + '/bvlc_alexnet_deploy.prototxt');
loadWeights(net, __dirname + '/bvlc_alexnet.caffemodel');
