/**
 * @noflow
 */

'use strict'; // Enable block-scoped declarations in node4

const caffe = require('../');
const assert = require('assert');

suite('bindings', () => {
  test('test exports', () => {
    assert.ok('mode' in caffe, 'mode property exists');
    assert.equal(caffe.mode, 'CPU', 'mode should be CPU by default');
    caffe.mode = 'CPU';
    assert.equal(caffe.mode, 'CPU', 'mode should be CPU after setting to CPU');
    caffe.mode = 'cpu';
    assert.equal(caffe.mode, 'CPU', 'mode should be CPU after setting to cpu');
    assert.ok(caffe.gpus >= 0, 'Number of GPU devices');
  });

  test('test blob', () => {
    let Blob = caffe.Blob;
    let FloatArray = Float32Array;
    assert.ok(Blob, caffe.BlobFloat, 'Blob should default to BlobFloat');
    let shape = [1, 2, 3, 4];
    let blob = new Blob(shape);
    assert.equal(
      Object.prototype.toString.call(blob),
      '[object ' + Blob.name + ']', 'Blob class name should be as expected'
    );
    let data = blob.data;
    assert.ok(
      shape.reduce((sum, dim) => sum * dim, 1) <= data.length,
      'length of blob.data should be at least the size of shape'
    );
    assert.ok(data instanceof FloatArray, 'data should be a typed array');
    assert.ok(blob.diff instanceof FloatArray, 'diff should be a typed array');
    assert.deepEqual(shape, blob.shape);
    assert.equal(
      data.length, shape[0] * shape[1] * shape[2] * shape[3],
      'data should have the right size'
    );
    assert.ok(
      !Array.from(data).some(x => x !== 0.0),
      'make sure data is all zeros'
    );
    data[1] = 47;
    assert.equal(data[1], 47, 'writing to data should work');
    assert.equal(
      new Blob().data.length,
      1,
      'allocating a Blob with no shape works and produces a Blob of length 1'
    );
    assert.throws(
      () => Blob.prototype.toString(),
      'calling toString on Blob prototype should throw'
    );
    assert.equal(
      Blob.prototype.shape,
      undefined,
      'shape on Blob prototype should return undefined'
    );
    assert.equal(
      Blob.prototype.data,
      undefined,
      'data on Blob prototype should return undefined'
    );
    assert.equal(
      Blob.prototype.diff,
      undefined,
      'diff on Blob prototype should return undefined'
    );
    assert.throws(
      () => (blob.toString.call({})),
      'trying to call Blob function on a regular object should throw'
    );
    assert.ok(
      Blob(), // eslint-disable-line new-cap
      'calling Blob() without new should work'
    );
  });

  test('test layer', () => {
    let Layer = caffe.Layer;
    assert.ok(Layer, caffe.LayerFloat, 'Layer should default to LayerFloat');
    let layer = new Layer();
    assert.ok(layer, 'construct a Layer object');
    assert.equal(
      Layer(), // eslint-disable-line new-cap
      undefined,
      'calling the Layer constructor as a function should return undefined'
    );
    assert.equal(
      layer.type,
      undefined,
      'layer.type on a user instantiated Layer shouldn\'t crash'
    );
  });

  test('test net', () => {
    let Net = caffe.Net;
    let net = new caffe.Net('./test/lenet_train_test.prototxt', 'test');
    assert.equal(
      Object.prototype.toString.call(net),
      '[object ' + Net.name + ']',
      'Net class name should be as expected'
    );
    assert.equal(net.name, 'LeNet', 'name of the net should match');
    assert.equal(net.phase, 'test', 'phase should be test');
    assert.deepEqual(
      net.layer_names,
      [
        'mnist',
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
        'loss',
      ],
      'check layer_names'
    );
    assert.deepEqual(
      net.blob_names,
      [
        'data',
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
        'loss',
      ],
      'check blob_names'
    );
    assert.equal(
      net.blobs.length,
      net.blob_names.length,
      'each blob should have a name'
    );
    assert.equal(
      net.layers.length,
      net.layer_names.length,
      'each layer should have a name'
    );
    assert.equal(
      net.layers[0].type,
      'BufferedDataLayer',
      'the input layer should be a buffered data layer'
    );
    net.layers.filter(layer => layer.type !== 'BufferedDataLayer').forEach(layer => {
      assert.throws(
        () => layer.queueLength && layer.enqueue(),
        'every other layer than BufferedDataLayer should throw if' +
        ' we try queueLength and enqueue on it'
      );
    });
    let input = net.layers[0];
    assert.doesNotThrow(
      () => {
        assert.equal(input.queueLength, 0, 'queue length should be 0 initially');
        let blobs = [
          new caffe.Blob(net.blobs[0].shape),
          new caffe.Blob(net.blobs[1].shape),
        ];
        for (let i = 0; i < blobs.length; ++i) {
          assert.equal(
            net.blobs[i].data.length, blobs[i].data.length,
            'blob ' + i +
            ' length should match after copy initialization with shape'
          );
        }
        blobs[0].data[0] = 17;
        blobs[1].data[0] = 42;
        input.enqueue(blobs);
        assert.equal(
          input.queueLength,
          1,
          'queue length should be 1 after we added blobs'
        );
        assert.equal(
          net.blobs[0].data[0],
          0,
          'input blob should be unchanged before we call forward'
        );
        net.forward(loss => {
          assert.equal(
            input.queueLength,
            0,
            'queue length should be 0 after we ran forward'
          );
          for (let i = 0; i < blobs.length; ++i) {
            assert.equal(
              net.blobs[i].data[0],
              (i === 0) ? 17 : 42,
              'input blob ' + i + ' should change after we call forward'
            );
          }
        });
      },
      'queueLength and enqueue should not throw on BufferedDataLayer'
    );
  });

  test('test solver', () => {
    let Solver = caffe.Solver;
    let solver = new Solver('./test/lenet_solver.prototxt');
    assert.ok(solver, 'make sure we can construct a Solver object');
    assert.ok(
      solver.net.layer_names.length > 0,
      'we should have a net and layers'
    );
    assert.ok(solver.test_nets.length > 0, 'we should have a test net as well');
    assert.equal(solver.iter, 0, 'iter should be 0 initially');
    assert.deepEqual(
      solver.param.split('\n'),
      [
        'test_iter: 1',
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
        'snapshot_prefix: "./test/"',
        'solver_mode: CPU',
        'net: "./test/lenet_train_test.prototxt"',
        '',
      ],
      'check reading params'
    );
    let testNet = solver.test_nets[0];
    testNet.layers[0].enqueue([
      new caffe.Blob(testNet.blobs[0].shape),
      new caffe.Blob(testNet.blobs[1].shape),
    ]);
    let net = solver.net;
    net.layers[0].enqueue([
      new caffe.Blob(net.blobs[0].shape),
      new caffe.Blob(net.blobs[1].shape),
    ]);
    solver.step(1, () => {
      assert.ok(true, 'solver.step works');
      net.snapshot('/tmp/dummy.caffemodel');
    });
  });
});
