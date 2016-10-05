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
const path = require('path');
const cl = require('node-opencl');

const Shape = require('../shape');
const Blob = require('../blob');
const Profiler = require('../profiler');

const clblas = require('./cl/clblas');

let precision = 32;

// query all properties of a handle
function query(fn, handle) {
  let info = {};
  Object.keys(cl).forEach(name => {
    try {
      info[name] = fn(handle, cl[name]);
    } catch (e) { }
  });
  return info;
}

let rt = null;

// The CLBuffer class enables efficient sharing of data between the GPU and CPU on
// shared memory architectures such as Intel Iris Pro (x86) and Adreno (ARM).
// Once allocated a Buffer can be touched by the GPU or the CPU. There is a cost
// to transition between the two modes, but the cost is modest.

class CLBuffer {
  // q: cl_command_queue
  // type: TypedArray (i.e. Float32Array)
  // length: number of elements of type 'type'
  // copy: if true, copy data to GPU instead of using shared memory
  constructor(q, type, length, copy) {
    this.q = q;
    this.ctx = cl.getCommandQueueInfo(q, cl.QUEUE_CONTEXT);
    this.type = type;
    this.length = length;
    this.size = type.prototype.BYTES_PER_ELEMENT * length;
    this.gpu_mem = null;
    this.gpu_event = null;
    this.cpu_mem = null;
    this.cpu_mode = '';
    this.copy = copy;
  }

  // Get the pending event as a list of events, or null if the GPU is idle
  pending() {
    if (!this.gpu_event) {
      return [];
    }
    let events = [this.gpu_event];
    this.gpu_event = null;
    return events;
  }

  // Mark the gpu as busy pending the completion of the given event
  busy(event) {
    assert(!this.gpu_event);
    this.gpu_event = event;
  }

  // Return a cl_mem handle to GPU memory holding this blob. This temporarily
  // revokes CPU access to the data.
  to_gpu() {
    if (!this.gpu_mem) {
      this.gpu_mem = cl.createBuffer(this.ctx,
                                     cl.MEM_READ_WRITE | (this.copy ? 0 : cl.MEM_ALLOC_HOST_PTR),
                                     this.size,
                                     null);
    }
    if (this.cpu_mem) {
      assert(!this.gpu_event);
      this.busy(cl.enqueueUnmapMemObject(this.q,
                                         this.gpu_mem,
                                         this.cpu_mem.buffer,
                                         [],
                                         true));
      this.cpu_mem = null;
    }
    return this.gpu_mem;
  }

  // Return a typed array view of the data of this blob. This temporarily revokes
  // GPU access to the data.
  to_cpu(mode) {
    if (!mode) {
      mode = 'r';
    }
    // If we haven't allocated GPU memory yet, we have to do that first.
    if (!this.gpu_mem) {
      this.to_gpu();
    }
    // If we have CPU access now but not the right mode, we have to-remap.
    if (this.cpu_mem) {
      if (this.cpu_mode.indexOf(mode) >= 0) {
        return this.cpu_mem;
      }
      this.to_gpu();
    }
    this.cpu_mem = new (this.type)(cl.enqueueMapBuffer(this.q,
                                                       this.gpu_mem,
                                                       true,
                                                       ((mode === 'r' || mode === 'rw') ? cl.MAP_READ : 0) |
                                                       ((mode === 'w' || mode === 'rw') ? cl.MAP_WRITE : 0),
                                                       0,
                                                       this.size,
                                                       this.pending(),
                                                       false));
    this.cpu_mode = mode;
    return this.cpu_mem;
  }

  set(data) {
    this.to_cpu('w');
    this.cpu_mem.set(data);
    return this;
  }

  // Wait for the operation that is producing this blob to complete and measure how long that took.
  wait() {
    let ev = this.gpu_event;
    if (ev) {
      cl.waitForEvents([ev]);
      let to_double = t => ((t[0] >>> 0) * 0x100000000 + t[1]) / 1000000;
      let start = cl.getEventProfilingInfo(ev, cl.PROFILING_COMMAND_START);
      let end = cl.getEventProfilingInfo(ev, cl.PROFILING_COMMAND_END);
      cl.releaseEvent(ev);
      this.gpu_event = null;
      return to_double(end) - to_double(start);
    }
    return 0;
  }

  release() {
    if (this.gpu_mem) {
      this.to_gpu();
      this.wait();
      cl.releaseMemObject(this.gpu_mem);
      this.gpu_mem = null;
      this.ctx = null;
    }
  }
}

// Compile the source file with the given configuration, which consists of defines
// and a suffix we append to the kernel name so we can compile and cache multiple
// kernels with a different configuration in the same lookup table.
function compile(srcfiles, config) {
  let src = srcfiles.map(filename => fs.readFileSync(path.join(__dirname, 'cl', filename + '.cl'), 'utf8')).join('\n');
  let suffix = config.ID || '';
  let opts = Object.keys(config).map(name => '#define ' + name + ' ' + config[name]);
  opts.push('#define PRECISION ' + precision);
  let prog = cl.createProgramWithSource(rt.ctx, opts.join('\n') + src);
  try {
    cl.buildProgram(prog, null, '-cl-fast-relaxed-math');
    cl.createKernelsInProgram(prog).forEach(kernel => {
      rt.kernels[cl.getKernelInfo(kernel, cl.KERNEL_FUNCTION_NAME) + suffix] = kernel;
    });
    cl.releaseProgram(prog);
  } catch (e) {
    let devices = cl.getProgramInfo(prog, cl.PROGRAM_DEVICES);
    devices.forEach(device => {
      let msg = cl.getProgramBuildInfo(prog, device, cl.PROGRAM_BUILD_LOG).replace('\0', '').trim();
      msg && console.log(msg);
    });
  }
}

// Sources for the GEMM kernel
const gemm_srcs = ['common', 'copy_fast', 'copy_pad', 'transpose_fast', 'transpose_pad', 'xgemm'];

// We expose some limited functionality to clblas so it can use our kernel
// cache and allocate memory (via allocating and releasing blobs)
const clruntime = {
  allocate: allocate,
  release: release,
  run: run,
  kernel: (kernelName, config) => {
    let name = kernelName + (config.ID || '');
    let kernel = rt.kernels[name];
    if (!kernel) {
      compile(gemm_srcs, config);
    }
    return rt.kernels[name];
  },
  get deviceInfo() {
    return rt.q.deviceInfo;
  },
  get machineName() {
    return rt.q.machineName;
  },
  set precision(p) {
    precision = p;
  },
};

function start() {
  rt = {};
  // Allocate a CL context and find a suitable device
  rt.platform = cl.getPlatformIDs()[0];
  rt.ctx = cl.createContextFromType([cl.CONTEXT_PLATFORM, rt.platform], cl.DEVICE_TYPE_ALL, null, null);
  rt.ctxInfo = query(cl.getContextInfo, rt.ctx);
  rt.devices = rt.ctxInfo.CONTEXT_DEVICES;
  rt.deviceInfo = rt.devices.map(device => query(cl.getDeviceInfo, device));
  rt.deviceInfo.forEach(info => Profiler.emit('deviceFound', { deviceInfo: info }));
  let selected = 0;
  let device = rt.devices[selected];
  Profiler.emit('deviceSelected', { deviceInfo: rt.deviceInfo[selected] });
  let q;
  if (cl.createCommandQueueWithProperties) {
    q = cl.createCommandQueueWithProperties(rt.ctx, device, [cl.QUEUE_PROPERTIES, cl.QUEUE_PROFILING_ENABLE]); // OpenCL 2
  } else {
    q = cl.createCommandQueue(rt.ctx, device, cl.QUEUE_PROFILING_ENABLE);
  }
  rt.q = q;
  let deviceInfo = rt.deviceInfo[selected];
  rt.q.deviceInfo = deviceInfo;
  rt.q.machineName = deviceInfo.DEVICE_NAME;
  rt.copy = deviceInfo.DEVICE_HOST_UNIFIED_MEMORY;
  rt.maxWorkGroupSize = Math.min(512, deviceInfo.DEVICE_MAX_WORK_GROUP_SIZE);
  rt.configs = require('./cl/configs')(rt.q.machineName + '-' + precision);
  // Compile our kernels
  rt.kernels = {};
  compile(['kernels'], {});
  rt.configs.forEach(config => {
    compile(['common', 'copy_fast', 'copy_pad', 'transpose_fast', 'transpose_pad', 'xgemm'], config);
  });
}

function stop() {
  Object.keys(rt.kernels).forEach(name => cl.releaseKernel(rt.kernels[name]));
  cl.releaseCommandQueue(rt.q);
  cl.releaseContext(rt.ctx);
  rt = null;
}

// set_data and get_data directly use CLBuffer instead of relying on the higher level
// allocate/upload/download/release abstractions because upload and download use
// set_data and get_data (in particular when precision === 16)
function set_data(buffer, data) {
  if (buffer.type === Float32Array) {
    buffer.set(data);
    return;
  }
  let float_buffer = new CLBuffer(rt.q, Float32Array, data.length, rt.copy);
  set_data(float_buffer, data);
  let kernel = rt.kernels.from_float;
  cl.setKernelArg(kernel, 0, 'int', data.length);
  cl.setKernelArg(kernel, 1, 'float*', float_buffer.to_gpu());
  cl.setKernelArg(kernel, 2, 'float*', buffer.to_gpu());
  run(kernel, [data.length], null, [float_buffer], buffer);
  float_buffer.release();
}

function get_data(buffer, data) {
  if (buffer.type === Float32Array) {
    data.set(buffer.to_cpu('r'));
    return;
  }
  let float_buffer = new CLBuffer(rt.q, Float32Array, data.length, rt.copy);
  let kernel = rt.kernels.to_float;
  cl.setKernelArg(kernel, 0, 'int', data.length);
  cl.setKernelArg(kernel, 1, 'float*', buffer.to_gpu());
  cl.setKernelArg(kernel, 2, 'float*', float_buffer.to_gpu());
  run(kernel, [data.length], null, [buffer], float_buffer);
  get_data(float_buffer, data);
  float_buffer.release();
}

let pending_buffers = 0;

function allocate(blob) {
  if (!pending_buffers++) {
    start();
  }
  assert(!blob.buffer);
  blob.buffer = new CLBuffer(rt.q, (precision === 16) ? Int16Array : Float32Array, blob.shape.size, rt.copy);
  // we don't allow the creation of sub-blobs from GPU blobs (for now)
  blob.subBlob = null;
  Profiler.emit('allocate', { blob: blob });
}

function upload(blob, data) {
  assert(blob.shape.size === data.length);
  allocate(blob);
  set_data(blob.buffer, data);
}

function download(blob) {
  assert(blob.buffer);
  // make a copy, the blob might get deallocated while the caller still holds result
  let result = new Float32Array(blob.shape.size);
  get_data(blob.buffer, result);
  return result;
}

function release(blob) {
  // nets have weights that are held in blobs so we won't shut down CL until the
  // last net is released
  blob.buffer.release();
  blob.buffer = null;
  if (!--pending_buffers) {
    stop();
  }
  Profiler.emit('release', { blob: blob });
}

function run(kernel, global_work, local_work, in_buffers, out_buffer) {
  let events = [];
  in_buffers.forEach(buffer => {
    events = events.concat(buffer.pending());
  });
  out_buffer.busy(cl.enqueueNDRangeKernel(rt.q, kernel, global_work.length, null, global_work, local_work, events, true));
  Profiler.emit('clrun', { kernel: cl.getKernelInfo(kernel, cl.KERNEL_FUNCTION_NAME), global: global_work, local: local_work, out_buffer: out_buffer });
}

function im2col(config, in_blob, in_data_offset, filter_size, filter_stride, filter_pad) {
  let in_shape = in_blob.shape;
  let out_height = Math.floor((in_shape.height + 2 * filter_pad - filter_size) / filter_stride + 1);
  let out_width = Math.floor((in_shape.width + 2 * filter_pad - filter_size) / filter_stride + 1);
  let out_channels = roundUp(in_shape.channels * filter_size * filter_size, config.KWG);
  let out_shape = new Shape(1, out_channels, out_height, out_width);
  let out_blob = new Blob(out_shape);
  allocate(out_blob);
  let in_buffer = in_blob.buffer;
  let out_buffer = out_blob.buffer;
  let kernel = rt.kernels.im2col;
  cl.setKernelArg(kernel, 0, 'float*', in_buffer.to_gpu());
  cl.setKernelArg(kernel, 1, 'int', in_data_offset);
  cl.setKernelArg(kernel, 2, 'int', in_shape.channels);
  cl.setKernelArg(kernel, 3, 'int', in_shape.height);
  cl.setKernelArg(kernel, 4, 'int', in_shape.width);
  cl.setKernelArg(kernel, 5, 'int', filter_size);
  cl.setKernelArg(kernel, 6, 'int', filter_stride);
  cl.setKernelArg(kernel, 7, 'int', filter_pad);
  cl.setKernelArg(kernel, 8, 'float*', out_buffer.to_gpu());
  cl.setKernelArg(kernel, 9, 'int', out_channels);
  cl.setKernelArg(kernel, 10, 'int', out_height);
  cl.setKernelArg(kernel, 11, 'int', out_width);
  run(kernel, [out_shape.spatial, in_shape.channels], null, [in_buffer], out_buffer);
  return out_blob;
}

// Select the best configuration to use for the given GEMM dimensions
function gemm_config(M, N, K) {
  let configs = rt.configs;
  let config = configs[0];
  for (let i = 1; i < configs.length; ++i) {
    if (M < configs[i].MWG) {
      break;
    }
    config = configs[i];
  }
  return config;
}

function convolution(in_blob, out_blob,
                     filter_num, filter_size, filter_stride, filter_pad,
                     filters, biases) {
  let in_shape = in_blob.shape;
  let out_shape = out_blob.shape;
  let M = filter_num;
  let N = out_blob.shape.spatial;
  let K = in_blob.shape.channels * filter_size * filter_size;

  const config = gemm_config(M, N, K);

  for (let b = 0; b < in_shape.batch_size; ++b) {
    let col_blob = im2col(config,
                          in_blob, b * in_shape.channels * in_shape.spatial,
                          filter_size, filter_stride, filter_pad);
    clblas.gemm(clruntime,
                config,
                clblas.NoTrans, clblas.NoTrans, clblas.NoTrans,
                M, N, K,
                1,
                filters.buffer, 0, K, M,
                col_blob.buffer, 0, N, roundUp(K, config.KWG),
                0,
                out_blob.buffer, b * out_shape.channels * out_shape.spatial, N);
    release(col_blob);
  }
}

// Round n to the nearest multiple of factor f
function roundUp(n, f) {
  return n + f - 1 - (n - 1) % f;
}

function fullyConnected(in_blob, out_blob, weights) {
  let in_shape = in_blob.shape;
  let out_shape = out_blob.shape;
  let in_buffer = in_blob.buffer;
  let weights_buffer = weights.buffer;
  let out_buffer = out_blob.buffer;
  let M = out_shape.batch_size;
  let N = out_shape.channels * out_shape.spatial;
  let K = in_shape.channels * in_shape.spatial;
  if (M === 1) {
    // gemv fast path
    let kernel = rt.kernels.gemv;
    cl.setKernelArg(kernel, 0, 'int', N); // M
    cl.setKernelArg(kernel, 1, 'int', K); // N
    cl.setKernelArg(kernel, 2, 'float*', weights_buffer.to_gpu());
    cl.setKernelArg(kernel, 3, 'float*', in_buffer.to_gpu());
    cl.setKernelArg(kernel, 4, 'float*', out_buffer.to_gpu());
    // VWI: Vector width in i direction
    // KPT: Perform this many iterations in k direction per thread
    const VWI = 1;
    const KPT = rt.maxWorkGroupSize / VWI;
    cl.setKernelArg(kernel, 5, 'local', KPT * 4);
    run(kernel, [roundUp(N, VWI), KPT], [VWI, KPT], [in_buffer], out_buffer);
    return;
  }

  clblas.gemm(clruntime,
              gemm_config(M, N, K),
              clblas.NoTrans, clblas.Trans, clblas.NoTrans,
              M, N, K,
              1,
              in_blob.buffer, 0, K, M,
              weights.buffer, 0, K, N,
              0,
              out_blob.buffer, 0, N);
}

function normalize(out_blob, means_blob, scales_blob, negative_slope) {
  let kernel = rt.kernels.batch_normalize;
  let shape = out_blob.shape;
  let n = shape.size;
  let data_buffer = out_blob.buffer;
  let means_buffer = means_blob.buffer;
  let scales_buffer = scales_blob.buffer;
  cl.setKernelArg(kernel, 0, 'int', n);
  cl.setKernelArg(kernel, 1, 'int', shape.spatial);
  cl.setKernelArg(kernel, 2, 'int', shape.channels);
  cl.setKernelArg(kernel, 3, 'float*', data_buffer.to_gpu());
  cl.setKernelArg(kernel, 4, 'float*', means_buffer.to_gpu());
  cl.setKernelArg(kernel, 5, 'float*', scales_buffer.to_gpu());
  cl.setKernelArg(kernel, 6, 'float', negative_slope);
  run(kernel, [n], null, [data_buffer], data_buffer);
}

function bias(out_blob, biases_blob, negative_slope) {
  let kernel = rt.kernels.bias;
  let shape = out_blob.shape;
  let n = shape.size;
  let data_buffer = out_blob.buffer;
  let biases_buffer = biases_blob.buffer;
  cl.setKernelArg(kernel, 0, 'int', n);
  cl.setKernelArg(kernel, 1, 'int', shape.spatial);
  cl.setKernelArg(kernel, 2, 'int', shape.channels);
  cl.setKernelArg(kernel, 3, 'float*', data_buffer.to_gpu());
  cl.setKernelArg(kernel, 4, 'float*', biases_buffer.to_gpu());
  cl.setKernelArg(kernel, 5, 'float', negative_slope);
  run(kernel, [n], null, [data_buffer], data_buffer);
}

function relu(in_blob, out_blob, negative_slope) {
  let kernel = rt.kernels.relu;
  let n = in_blob.shape.size;
  let in_buffer = in_blob.buffer;
  let out_buffer = out_blob.buffer;
  cl.setKernelArg(kernel, 0, 'int', n);
  cl.setKernelArg(kernel, 1, 'float*', in_buffer.to_gpu());
  cl.setKernelArg(kernel, 2, 'float*', out_buffer.to_gpu());
  cl.setKernelArg(kernel, 3, 'float', negative_slope);
  run(kernel, [n], null, [in_buffer], out_buffer);
}

function maxPooling(in_blob, out_blob, filter_size, filter_stride, filter_pad) {
  let kernel = rt.kernels.max_pooling;
  let in_shape = in_blob.shape;
  let out_shape = out_blob.shape;
  let n = out_shape.size;
  let in_buffer = in_blob.buffer;
  let out_buffer = out_blob.buffer;
  cl.setKernelArg(kernel, 0, 'int', n);
  cl.setKernelArg(kernel, 1, 'float*', in_buffer.to_gpu());
  cl.setKernelArg(kernel, 2, 'int', in_shape.height);
  cl.setKernelArg(kernel, 3, 'int', in_shape.width);
  cl.setKernelArg(kernel, 4, 'int', filter_size);
  cl.setKernelArg(kernel, 5, 'int', filter_stride);
  cl.setKernelArg(kernel, 6, 'int', filter_pad);
  cl.setKernelArg(kernel, 7, 'float*', out_buffer.to_gpu());
  cl.setKernelArg(kernel, 8, 'int', out_shape.batch_size);
  cl.setKernelArg(kernel, 9, 'int', out_shape.channels);
  cl.setKernelArg(kernel, 10, 'int', out_shape.height);
  cl.setKernelArg(kernel, 11, 'int', out_shape.width);
  run(kernel, [n], null, [in_buffer], out_buffer);
}

module.exports = {
  name: 'OpenCL',
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
  // expose the CL runtime object for testing
  clruntime: clruntime,
};
