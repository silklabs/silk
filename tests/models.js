/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

'use strict';

const fs = require('fs');
const Net = require('../src/net');
const Profiler = require('../src/profiler');
const darknet = require('../lib/darknet');
const path = require('path');

function delta(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; ++i) {
    d += Math.abs(a[i] - b[i]);
  }
  return d / a.length;
}

// Listen in on allocations and make sure they are balanced
class LeakChecker {
  constructor() {
    this.counter = 0;
    this.on_allocate = () => this.counter++;
    this.on_release = () => this.counter--;
    Profiler.on('allocate', this.on_allocate);
    Profiler.on('release', this.on_release);
  }

  ok() {
    Profiler.removeListener('allocate', this.on_allocate);
    Profiler.removeListener('release', this.on_release);
    return !this.counter;
  }
}

let models = [{
  name: 'tiny_yolo',
  cfg: path.join(__dirname, '..', 'models', 'tiny-yolo.cfg'),
  weights: path.join(__dirname, '..', 'models', 'tiny-yolo.weights'),
  outputs: 1470,
  input: path.join(__dirname, '..', 'models', 'tiny-yolo-input.json'),
  ref: path.join(__dirname, '..', 'models', 'tiny-yolo-ref.json'),
}, {
  name: 'tiny_coco',
  cfg: path.join(__dirname, '..', 'models', 'tiny-coco.cfg'),
  weights: path.join(__dirname, '..', 'models', 'tiny-coco.weights'),
  outputs: 4655,
  input: path.join(__dirname, '..', 'models', 'tiny-yolo-input.json'),
  ref: path.join(__dirname, '..', 'models', 'tiny-coco-ref.json'),
}];

Object.keys(Net.backends).forEach(backend_name => {
  if (backend_name === 'lowp') { // not testing lowp for now
    return;
  }
  let backend = Net.backends[backend_name];
  models.forEach(model => {
    module.exports[['test', model.name, backend_name].join('_')] = test => {
      test.expect(3);
      let leaks = new LeakChecker();
      let net = darknet.load(model.cfg, model.weights, backend);
      let input = JSON.parse(fs.readFileSync(model.input));
      let output = net.forward(input);
      net.release();
      test.ok(leaks.ok());
      let ref = JSON.parse(fs.readFileSync(model.ref));
      test.equal(output.length, ref.length);
      test.ok(delta(output, ref) < 0.00001);
      test.done();
    };
  });
});
