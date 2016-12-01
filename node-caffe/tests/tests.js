/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

'use strict';

var caffe = require('../src/module.js');

exports.testExports = function(test) {
  test.expect(5);
  test.ok("mode" in caffe, "mode property exists");
  test.equals(caffe.mode, "CPU", "mode should be CPU by default");
  caffe.mode = "CPU";
  test.equals(caffe.mode, "CPU", "mode should be CPU after setting to 'CPU'");
  caffe.mode = "cpu";
  test.equals(caffe.mode, "CPU", "mode should be CPU after setting to 'cpu'");
  test.ok(caffe.gpus >= 0, "Number of GPU devices");
  test.done();
};

exports.testBlob = function(test) {
  var Blob = caffe.Blob;
  var FloatArray = Float32Array;
  test.expect(16);
  test.ok(Blob, caffe.BlobFloat, "Blob should default to BlobFloat");
  var shape = [1,2,3,4];
  var blob = new Blob(shape);
  test.equal(Object.prototype.toString.call(blob), '[object ' + Blob.name + ']', "Blob class name should be as expected");
  var data = blob.data;
  test.ok(shape.reduce((sum, dim) => sum * dim, 1) <= data.length, "length of blob.data should be at least the size of shape");
  test.ok(data instanceof FloatArray, "data should be a typed array");
  test.ok(blob.diff instanceof FloatArray, "diff should be a typed array");
  test.deepEqual(shape, blob.shape);
  test.equals(data.length, shape[0]*shape[1]*shape[2]*shape[3], "data should have the right size");
  test.ok(!Array.from(data).some(x => x !== 0.0), "make sure data is all zeros");
  data[1] = 47;
  test.equal(data[1], 47, "writing to data should work");
  test.equal(new Blob().data.length, 1, "allocating a Blob with no shape works and produces a Blob of length 1");
  test.throws(() => Blob.prototype.toString(), "calling toString on Blob prototype should throw");
  test.equal(Blob.prototype.shape, undefined, "shape on Blob prototype should return undefined");
  test.equal(Blob.prototype.data, undefined, "data on Blob prototype should return undefined");
  test.equal(Blob.prototype.diff, undefined, "diff on Blob prototype should return undefined");
  test.throws(() => (blob.toString.call({})), "trying to call Blob function on a regular object should throw");
  test.ok(Blob(), "calling Blob() without new should work");
  test.done();
}

exports.testLayer = function(test) {
  var Layer = caffe.Layer;
  test.expect(4);
  test.ok(Layer, caffe.LayerFloat, "Layer should default to LayerFloat");
  var layer = new Layer();
  test.ok(layer, "construct a Layer object");
  test.equal(Layer(), undefined, "calling the Layer constructor as a function should return undefined");
  test.equal(layer.type, undefined, "layer.type on a user instantiated Layer shouldn't crash");
  test.done();
}

exports.testNet = function(test) {
  var Net = caffe.Net;
  test.expect(28);
  var net = new caffe.Net('./tests/lenet_train_test.prototxt', 'test');
  test.equal(Object.prototype.toString.call(net), '[object ' + Net.name + ']', "Net class name should be as expected");
  test.equal(net.name, "LeNet", "name of the net should match");
  test.equal(net.phase, "test", "phase should be test");
  test.deepEqual(net.layer_names, ['mnist',
                                   'label_mnist_1_split',
                                   'conv1',
                                   'pool1',
                                   'conv2',
                                   'pool2',
                                   'ip1',
                                   'relu1',
                                   'ip2',
                                   'ip2_ip2_0_split',
                                   'accuracy',
                                   'loss' ], "check layer_names");
  test.deepEqual(net.blob_names, ['data',
                                  'label',
                                  'label_mnist_1_split_0',
                                  'label_mnist_1_split_1',
                                  'conv1',
                                  'pool1',
                                  'conv2',
                                  'pool2',
                                  'ip1',
                                  'ip2',
                                  'ip2_ip2_0_split_0',
                                  'ip2_ip2_0_split_1',
                                  'accuracy',
                                  'loss'], "check blob_names");
  test.equal(net.blobs.length, net.blob_names.length, "each blob should have a name");
  test.equal(net.layers.length, net.layer_names.length, "each layer should have a name");
  test.equal(net.layers[0].type, "BufferedDataLayer", "the input layer should be a buffered data layer");
  net.layers.filter(layer => layer.type !== "BufferedDataLayer").forEach(layer => {
      test.throws(() => layer.queueLength && layer.enqueue(), "every other layer than BufferedDataLayer should throw if we try queueLength and enqueue on it");
  });
  var input = net.layers[0];
  test.doesNotThrow(() => {
    test.equal(input.queueLength, 0, "queue length should be 0 initially");
    var blobs = [new caffe.Blob(net.blobs[0].shape), new caffe.Blob(net.blobs[1].shape)];
    for (var i = 0; i < blobs.length; ++i)
      test.equal(net.blobs[i].data.length, blobs[i].data.length, "blob " + i + " length should match after copy initialization with shape");
    blobs[0].data[0] = 17;
    blobs[1].data[0] = 42;
    input.enqueue(blobs);
    test.equal(input.queueLength, 1, "queue length should be 1 after we added blobs");
    test.equal(net.blobs[0].data[0], 0, "input blob should be unchanged before we call forward");
    net.forward(loss => {
      test.equal(input.queueLength, 0, "queue length should be 0 after we ran forward");
      for (var i = 0; i < blobs.length; ++i)
        test.equal(net.blobs[i].data[0], (i == 0) ? 17 : 42, "input blob " + i + " should change after we call forward");
      test.done();
    });
  }, "queueLength and enqueue should not throw on BufferedDataLayer");
}

exports.testSolver = function (test) {
  var Solver = caffe.Solver;
  test.expect(6);
  var solver = new Solver('./tests/lenet_solver.prototxt');
  test.ok(solver, "make sure we can construct a Solver object");
  test.ok(solver.net.layer_names.length > 0, "we should have a net and layers");
  test.ok(solver.test_nets.length > 0, "we should have a test net as well");
  test.equal(solver.iter, 0, "iter should be 0 initially");
  test.deepEqual(solver.param.split('\n'), [ 'test_iter: 1',
                                             'test_interval: 500',
                                             'base_lr: 0.01',
                                             'display: 100',
                                             'max_iter: 10000',
                                             'lr_policy: "inv"',
                                             'gamma: 0.0001',
                                             'power: 0.75',
                                             'momentum: 0.9',
                                             'weight_decay: 0.0005',
                                             'snapshot: 5000',
                                             'snapshot_prefix: "./tests/"',
                                             'solver_mode: CPU',
                                             'net: "./tests/lenet_train_test.prototxt"',
                                             '' ], "check reading params");
  var test_net = solver.test_nets[0];
  test_net.layers[0].enqueue([new caffe.Blob(test_net.blobs[0].shape), new caffe.Blob(test_net.blobs[1].shape)]);
  var net = solver.net;
  net.layers[0].enqueue([new caffe.Blob(net.blobs[0].shape), new caffe.Blob(net.blobs[1].shape)]);
  solver.step(1, () => {
    test.ok(true, "solver.step works");
    net.snapshot('/tmp/dummy.caffemodel');
    test.done();
  });
}
