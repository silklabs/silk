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
const Shape = require('../src/shape');
const Blob = require('../src/blob');
const Net = require('../src/net');
const ConvLayer = require('../src/layers').ConvLayer;
const PoolingLayer = require('../src/layers').PoolingLayer;
const ConnectedLayer = require('../src/layers').ConnectedLayer;
const IO = require('./io');

function parseConfig(filename) {
  let text = fs.readFileSync(filename, 'utf8');
  let lines = text.split('\n');
  assert(lines[0] === '[net]');
  let config = [];
  let current;
  lines.forEach(line => {
    if (!line) {
      return;
    }
    if (/\[[^[]+\]/.test(line)) {
      config.push(current = { type: line.replace(/[\[\]]/g, ''), param: {} });
      return;
    }
    let [key, value] = line.split('=');
    assert(key && value && !(key in current.param));
    current.param[key] = value;
  });
  return config;
}

function negativeSlope(type) {
  switch (type) {
  case 'leaky':
    return 0.1;
  case 'relu':
    return 0;
  default:
    assert(type === 'linear');
    return 1;
  }
}

function loadNet(config, backend) {
  let net;
  let handlers = {
    net: p => {
      let in_shape = new Shape(1, p.channels | 0, p.height | 0, p.width | 0);
      net = new Net(in_shape, backend);
    },
    convolutional: p => {
      net.addLayer(new ConvLayer(p.filters | 0, p.size | 0, p.stride | 0, p.pad | 0,
                                 p.batch_normalize ? .000001 : 0, negativeSlope(p.activation)));
    },
    maxpool: p => net.addLayer(new PoolingLayer(p.size | 0, p.stride | 0, p.pad | 0, 'max')),
    connected: p => {
      net.addLayer(new ConnectedLayer(p.output | 0, negativeSlope(p.activation)));
    },
    detection: p => {
      net.detection = {
        classes: p.classes | 0,
        side: p.side | 0,
        num: p.num | 0,
      };
    },
    dropout: p => {
      // todo
    },
    softmax: p => {
      // todo
    },
    cost: p => {
      // ignore
    },
  };
  config.forEach(entry => handlers[entry.type](entry.param));
  return net;
}

// load weights from a file
function loadWeights(net, filename) {
  // Parse the weights file
  let filedata = IO.readFileSync(filename);
  let pos = 0;

  // Read data from the memory mapped weight file
  function read(words) {
    let current = pos;
    pos += words * 4;
    return filedata.slice(current, pos);
  }

  let header = read(4);
  let major = header.readInt32LE(0);
  let minor = header.readInt32LE(4);
  let revision = header.readInt32LE(8); // eslint-disable-line
  let seen = header.readInt32LE(12); // eslint-disable-line
  let transpose = (major > 1000) || (minor > 1000); // eslint-disable-line

  let handlers = {
    ConvLayer: (layer, in_shape, loadBlob) => {
      let filter_num = layer.filter_num;
      let shape = new Shape(1, filter_num, 1, 1);
      let biases = new Blob(shape);
      let scales = null;
      let means = null;
      let variances = null;
      let filters = new Blob(new Shape(1, filter_num, 1, in_shape.channels * layer.filter_size * layer.filter_size));
      loadBlob(biases);
      if (layer.eps) {
        scales = new Blob(shape);
        means = new Blob(shape);
        variances = new Blob(shape);
        loadBlob(scales);
        loadBlob(means);
        loadBlob(variances);
      }
      loadBlob(filters);
      layer.set(filters, biases, means, variances, scales);
    },
    ConnectedLayer: (layer, in_shape, loadBlob) => {
      let num_outputs = layer.num_outputs;
      let shape = new Shape(1, num_outputs, 1, 1);
      let biases = new Blob(shape);
      let weights = new Blob(new Shape(1, num_outputs, 1, in_shape.channels * in_shape.height * in_shape.width));
      loadBlob(biases);
      loadBlob(weights);
      layer.set(weights, biases);
    },
    PoolingLayer: () => {},
  };

  net.forLayers((layer, in_shape) => {
    handlers[layer.type](layer, in_shape, blob => {
      let size = blob.shape.size;
      let buffer = read(size);
      let data = new Float32Array(buffer.buffer, buffer.byteOffset, size);
      net.backend.upload(blob, data);
    });
  });

  // we better be at the end of the file
  assert(filedata.length === pos);
}

function load(model, weights, backend) {
  let config = parseConfig(model);
  let net = loadNet(config, backend);
  loadWeights(net, weights);
  return net;
}

module.exports = {
  load: load,
};
