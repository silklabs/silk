/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

'use strict';

const assert = require('assert');
const Blob = require('./blob');
const Profiler = require('./profiler');

class Net {
  constructor(in_shape, backend) {
    assert(in_shape);
    this.in_shape = in_shape;
    this.backend = backend ? backend : Net.backends.reference;
    this.out_layer = null;
  }

  // add a layer to the end of this network of layers
  addLayer(layer) {
    layer.net = this;
    layer.in_layer = this.out_layer;
    this.out_layer = layer;
    return layer;
  }

  // forward traverse all layers, passing along their input shapes
  forLayers(closure) {
    let net = this;
    function traverse(layer) {
      let in_layer = layer.in_layer;
      if (!in_layer) {
        closure(layer, net.in_shape);
        return net.in_shape;
      }
      let in_shape = in_layer.out_shape(traverse(in_layer));
      closure(layer, in_shape);
      return in_shape;
    }
    traverse(this.out_layer);
  }

  // get the output shape of the network given the network input shape
  out_shape() {
    let net_out_shape = null;
    this.forLayers((layer, in_shape) => {
      if (layer === this.out_layer) {
        net_out_shape = layer.out_shape(in_shape);
      }
    });
    return net_out_shape;
  }

  // forward pass over the network
  forward(in_data) {
    let in_shape = this.in_shape;
    assert(in_shape.size === in_data.length);
    let in_blob = new Blob(in_shape);
    this.backend.upload(in_blob, in_data);
    this.forLayers((layer, in_shape) => {
      assert(in_blob.shape.equals(in_shape));
      let out_shape = layer.out_shape(in_shape);
      let out_blob = in_blob;
      // if the layer produces a new shape we need to allocate a new blob
      if (!out_shape.equals(in_shape)) {
        out_blob = new Blob(out_shape);
        this.backend.allocate(out_blob);
      }
      Profiler.emit('beforeForward', { layer: layer, in_blob: in_blob });
      layer.forward(in_blob, out_blob);
      Profiler.emit('afterForward', { layer: layer, out_blob: out_blob });
      // if we created a new out_blob, we are done with in_blob
      if (out_blob !== in_blob) {
        this.backend.release(in_blob);
      }
      // our output is the new input
      in_blob = out_blob;
    });
    // the last output is tracked in in_blob, and thats our result
    let result = this.backend.download(in_blob);
    this.backend.release(in_blob);
    return result;
  }

  // release all blobs associated with this net
  release() {
    this.forLayers((layer, _) => {
      Object.keys(layer).forEach(prop => {
        let val = layer[prop];
        if (val instanceof Blob) {
          this.backend.release(val);
        }
      });
    });
  }

  toString() {
    return 'Net';
  }
}

Net.backends = { reference: require('./backends/reference') };

// All other backends are optional and may fail to initialize
['nnpack', 'opencl', 'qconv', 'lowp'].forEach(backend => {
  try {
    Net.backends[backend] = require('./backends/' + backend);
  } catch (e) { }
});

module.exports = Net;
