node-caffe
==========

Caffe bindings for node.

* Simple to use
* Allows Javascript to inspect layers and their content
* Support to classify and train networks
* Custom layer type (BufferedDataLayer) to feed data into network directly from JS

Usage
-----

To build the npm module first build Caffe and set "CAFFE_ROOT" to the distribute
directory inside Caffe (the source directory is not sufficient, we need the
compiled proto file "caffe.pb.h"). Make sure you use "make distribute" when
building Caffe.

    export CAFFE_ROOT=~/workspace/caffe/distribute

Here is an example how to instantiate a network:

    var net = new caffe.Net('lenet.prototxt', 'test'); // or 'train'
    var data = new Blob([1,1,24,24]);
    var label = new Blob([1,1]);
    data.data[17] = 42; // mnist data
    label.data[0] = 1; // label
    net.layers[0].enqueue([data, label]); // will be drained by forward()
    net.forward(loss => console.log(loss, net.layers[net.layers.length-1].data));

GPU vs CPU_ONLY
---------------

If Caffee is built with CPU_ONLY (no CUDA support), the node module must be
built with CPU_ONLY to prevent a mismatch between Caffe header files and
the Caffe library. We try to detect whether CPU_ONLY should be set by
checking for the presence of an installed CUDA SDK. This means that if you
have CUDA installed, please always compile Caffe WITH CUDA support, or bad
things will happen. If you do decide to use Caffe without CUDA, make sure
to remove the CUDA SDK or change bindings.gyp.

Blob
----

Blob is the basic data abstraction in Caffe. To construct a Blob object, pass
the shape as an array of dimensions to the constructor.

    var blob = new caffe.Blob([1,2,3,4])
    console.log(blob.shape, blob.data, blob.diff);

Use 'data' and 'diff' to access to underlying data, which is returned as a
typed array (Float32Array or Float64Array). Each access to the 'data' and
'diff' getters forces the data to be mapped into CPU memory. Keeping a copy
of the typed array can be dangerous since Caffe may drop the mapping, so its
best to only access the memory until the next Caffe method is called.

Layer
-----

Layers should not be constructed directly. Net constructs them when loading
a network description.

The bindings add a custom layer type (BufferedDataLayer) to Caffe which can
be used to feed data into networks that is supplied by a JavaScript callback.

'enqueue' and "queueLength" throw if called on any other layer type. Blob
arrays added with enqueue() will be drained by each call to net.forward().
Trying to mutate blobs that were passed to enqueue() is a bad idea.

Net
---

Supply a network description and the phase ('test' or 'train') to the Net
constructor to instantiate a network.

    var net = new caffe.Net('lenet.prototxt', 'test'); // or 'train'
    net.layers.forEach((layer, n) => console.log(net.layer_names[n], layer));
    net.blobs.forEach((blob, n) => console.log(net.blob_names[n], blob));

Layers and Blobs can be accessed with 'layers' and 'blobs', both of which
are arrays. The name of each Layer and Blob is stored in 'layer_names' and
'blob_names'.

To copy data from a model file, use 'copyTrainedLayersFrom'.

Solver
------

Solver instantiates train and test networks. To access them use 'net'
and 'test_nets'. The latter is an array since multiple test nets are
supported by Caffe.

Use 'solve' to run the solver.

    var solver = new Solver('./tests/lenet_solver.prototxt');
    solver.solve(() => console.log('done!'));

Float vs Double
---------------

The bindings support Float and Double variants of each data type, called
"BlobFloat" and "BlobDouble". An alias is set for each type ("Blob"),
that defaults to the "Float" variant.

Multi-GPU support
-----------------

To use multiple GPUs, enable GPU support and make sure to create a solver
for each GPU:

    caffe.mode = "GPU";
    console.log(caffe.deviceQuery);
    caffe.solverCount = caffe.gpus.length;

Once this has been done, solve(), step() and stepSync() automatically support
training across all available GPUs and weights are synchronized after every
iteration.

    solver.stepSync();
