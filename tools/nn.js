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
const Net = require('../src/net');
const profiler = require('../src/profiler');
const darknet = require('../lib/darknet');
const path = require('path');

let args = process.argv.join(' ');
let show_profile = args.indexOf('-profile') !== -1;
let show_mem = args.indexOf('-mem') !== -1;
let use_lowp = args.indexOf('-lowp') !== -1;
let show_perf = args.indexOf('-perf') !== -1;
let use_coco = args.indexOf('-coco') !== -1;
let use_alexnet = args.indexOf('-alexnet') !== -1;
let dont_validate = args.indexOf('-dont_validate') !== -1;
let use_opencl = args.indexOf('-opencl') !== -1;
let show_opencl_profile = args.indexOf('-opencl_profile') !== -1;
let use_nnpack = args.indexOf('-nnpack') !== -1;
let use_qconv = args.indexOf('-qconv') !== -1;
let use_fp16 = args.indexOf('-fp16') !== -1;

let mem_current = 0; // number of bytes allocated at the moment
let mem_count = 0; // number of blobs allocated at the moment
let mem_total = 0; // total number of blobs allocated
let mem_peak = 0; // peak bytes allocated

let model = 'tiny-yolo';
if (use_coco) {
  model = 'tiny-coco';
}
if (use_alexnet) {
  model = 'alexnet';
}

let model_cfg = path.join(__dirname, '..', 'models', model + '.cfg');
let model_weights = path.join(__dirname, '..', 'models', model + '.weights');
let model_ref = path.join(__dirname, '..', 'models', model + '-ref.json');

function nn() {
  if (show_profile) {
    let in_blob;
    let start;
    profiler.on('beforeForward', ev => {
      in_blob = ev.in_blob;
      start = Date.now();
    });
    profiler.on('afterForward', ev => {
      let layer = ev.layer;
      let out_blob = ev.out_blob;
      // make sure OpenCL layers complete before we time them
      if (out_blob.buffer) {
        out_blob.buffer.wait();
      }
      let stop = Date.now();
      console.log('Layer: ' + layer.type);
      console.log('Input: ' + in_blob.shape );
      console.log('Output: ' + out_blob.shape);
      console.log('Time: ' + (stop - start) + ' ms');
    });
  }
  if (show_mem) {
    profiler.on('allocate', ev => {
      ++mem_count;
      ++mem_total;
      mem_current += ev.blob.shape.size * 4;
      mem_peak = Math.max(mem_peak, mem_current);
    });
    profiler.on('release', ev => {
      --mem_count;
      mem_current -= ev.blob.shape.size * 4;
    });
  }
  if (show_opencl_profile) {
    profiler.on('clrun', ev => {
      console.log(ev.kernel + ' ' +
                  '([' + ev.global + ']/[' + (ev.local ? ev.local : 'default') + ']) ' +
                  'time: ' + Math.round(ev.out_buffer.wait() * 100) / 100 + ' ms');
    });
  }
  let backend = Net.backends.reference;
  if (use_lowp) {
    backend = Net.backends.lowp;
  }
  if (use_opencl) {
    backend = Net.backends.opencl;
    profiler.on('deviceSelected', ev => console.log('Using: ' + ev.deviceInfo.DEVICE_NAME));
    backend.clruntime.precision = (use_fp16) ? 16 : 32;
  }
  if (use_nnpack) {
    backend = Net.backends.nnpack;
  }
  if (use_qconv) {
    backend = Net.backends.qconv;
  }
  let net = darknet.load(model_cfg, model_weights, backend);
  console.log('backend: ' + net.backend.name);
  if (!use_opencl) {
    console.log('BLAS: ' + require('../src/math/blas').name);
  }
  let image = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'models', 'tiny-yolo-input.json'), 'utf8'));
  let out_data;
  out_data = net.forward(image);
  if (!dont_validate) {
    let ref_data = JSON.parse(fs.readFileSync(model_ref));
    let error = false;
    for (let i = 0; i < ref_data.length; ++i) {
      if (isNaN(out_data[i]) || Math.abs(ref_data[i] - out_data[i]) > (use_fp16 ? 0.05 : 0.0001)) {
        console.log(i, ref_data[i], out_data[i]);
        error = true;
      }
    }
    if (error) {
      throw new Error('validating output failed');
    }
  }
  if (show_perf) {
    // warmup
    console.log('warmup ...');
    for (let i = 0; i < 3; ++i) {
      out_data = net.forward(image);
    }
    console.log('measuring ...');
    let start = Date.now();
    let N = 10;
    for (let i = 0; i < N; ++i) {
      out_data = net.forward(image);
    }
    let stop = Date.now();
    console.log('time: ' + ((stop - start) / N) + ' ms');
  }
  net.release();
  if (show_mem) {
    assert(!mem_count);
    assert(!mem_current);
    console.log('peak memory use: ' + mem_peak.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' bytes');
    console.log('blobs allocated: ' + mem_total);
  }
  console.log('done.');
}

nn();
