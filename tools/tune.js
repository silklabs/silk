/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

'use strict';

const child_process = require('child_process');

const cl = require('node-opencl');
const path = require('path');
const ProgressBar = require('progress');
const MicroDB = require('../lib/microdb');

const Shape = require('../src/shape');
const Blob = require('../src/blob');
const backend = require('../src/backends/opencl');

function IsMultiple(a, b) {
  return (Math.floor(a / b) * b) === a;
}

const src_dir = path.join(__dirname, '..', 'src', 'backends', 'cl');
const PadCopyTranspose_src = ['common', 'copy_fast', 'copy_pad', 'transpose_fast', 'transpose_pad'].map(name => path.join(src_dir, name + '.cl'));
const Xgemm_src = ['common', 'xgemm'].map(name => path.join(src_dir, name + '.cl'));

let work_size = new Shape(1, 1, 2048, 2048);
let float_size = 32;
let machine_name = queryMachineName();

const programs = {
  CopyMatrixFast: {
    src: PadCopyTranspose_src,
    params: [
      ['COPY_DIMX', [8, 16, 32]],
      ['COPY_DIMY', [8, 16, 32]],
      ['COPY_WPT', [1, 2, 4, 8]],
      ['COPY_VW', [1, 2, 4, 8]],
    ],
    validate: config => true,
    local: (config) => [config.COPY_DIMX, config.COPY_DIMY],
    global: (config, work) => [work[0] / config.COPY_VW, work[1] / config.COPY_WPT],
    state: {
      src_ld: 2048, // guaranteed alignment for this kernel
      alpha: 1, // we don't really care about different values for alpha for now
    },
    mem: {
      src: work_size,
      dst: work_size,
    },
    setArgs: (kernel, state) => {
      cl.setKernelArg(kernel, 0, 'int', state.src_ld);
      cl.setKernelArg(kernel, 1, 'float*', state.src.buffer.to_gpu());
      cl.setKernelArg(kernel, 2, 'float*', state.dst.buffer.to_gpu());
      cl.setKernelArg(kernel, 3, 'float', state.alpha);
    },
  },
  CopyPadMatrix: {
    src: PadCopyTranspose_src,
    params: [
      ['PAD_DIMX', [8, 16, 32]],
      ['PAD_DIMY', [8, 16, 32]],
      ['PAD_WPTX', [1, 2, 4]],
      ['PAD_WPTY', [1, 2, 4]],
    ],
    validate: config => true,
    local: (config) => [config.PAD_DIMX, config.PAD_DIMY],
    global: (config, work) => [work[0] / config.PAD_WPTX, work[1] / config.PAD_WPTY],
    state: {
      src_one: 2048,
      src_two: 2048,
      src_ld: 2048,
      src_offset: 0,
      dst_one: 2048,
      dst_two: 2048,
      dst_ld: 2048,
      dst_offset: 0,
      alpha: 1,
    },
    mem: {
      src: work_size,
      dst: work_size,
    },
    setArgs: (kernel, state) => {
      cl.setKernelArg(kernel, 0, 'int', state.src_one);
      cl.setKernelArg(kernel, 1, 'int', state.src_two);
      cl.setKernelArg(kernel, 2, 'int', state.src_ld);
      cl.setKernelArg(kernel, 3, 'int', state.src_offset);
      cl.setKernelArg(kernel, 4, 'float*', state.src.buffer.to_gpu());
      cl.setKernelArg(kernel, 5, 'int', state.dst_one);
      cl.setKernelArg(kernel, 6, 'int', state.dst_two);
      cl.setKernelArg(kernel, 7, 'int', state.dst_ld);
      cl.setKernelArg(kernel, 8, 'int', state.dst_offset);
      cl.setKernelArg(kernel, 9, 'float*', state.dst.buffer.to_gpu());
      cl.setKernelArg(kernel, 10, 'float', state.alpha);
    },
  },
  TransposeMatrixFast: {
    src: PadCopyTranspose_src,
    params: [
      ['TRA_DIM', [4, 8, 16, 32, 64]],
      ['TRA_WPT', [1, 2, 4, 8, 16]],
      ['TRA_PAD', [0, 1]],
      ['TRA_SHUFFLE', [0, 1]],
    ],
    validate: config => true,
    local: (config) => [config.TRA_DIM, config.TRA_DIM],
    global: (config, work) => [work[0] / config.TRA_WPT, work[1] / config.TRA_WPT],
    state: {
      ld: 2048,
      alpha: 1,
    },
    mem: {
      src: work_size,
      dst: work_size,
    },
    setArgs: (kernel, state) => {
      cl.setKernelArg(kernel, 0, 'int', state.ld);
      cl.setKernelArg(kernel, 1, 'float*', state.src.buffer.to_gpu());
      cl.setKernelArg(kernel, 2, 'float*', state.dst.buffer.to_gpu());
      cl.setKernelArg(kernel, 3, 'float', state.alpha);
    },
  },
  TransposePadMatrix: {
    src: PadCopyTranspose_src,
    params: [
      ['PADTRA_TILE', [8, 16, 32, 64]],
      ['PADTRA_WPT', [1, 2, 4, 8, 16]],
      ['PADTRA_PAD', [0, 1]],
    ],
    validate: config => true,
    local: (config) => [config.PADTRA_TILE, config.PADTRA_TILE],
    global: (config, work) => [work[0] / config.PADTRA_WPT, work[1] / config.PADTRA_WPT],
    state: {
      src_one: 2048,
      src_two: 2048,
      src_ld: 2048,
      src_offset: 0,
      dst_one: 2048,
      dst_two: 2048,
      dst_ld: 2048,
      dst_offset: 0,
      alpha: 1,
    },
    mem: {
      src: work_size,
      dst: work_size,
    },
    setArgs: (kernel, state) => {
      cl.setKernelArg(kernel, 0, 'int', state.src_one);
      cl.setKernelArg(kernel, 1, 'int', state.src_two);
      cl.setKernelArg(kernel, 2, 'int', state.src_ld);
      cl.setKernelArg(kernel, 3, 'int', state.src_offset);
      cl.setKernelArg(kernel, 4, 'float*', state.src.buffer.to_gpu());
      cl.setKernelArg(kernel, 5, 'int', state.dst_one);
      cl.setKernelArg(kernel, 6, 'int', state.dst_two);
      cl.setKernelArg(kernel, 7, 'int', state.dst_ld);
      cl.setKernelArg(kernel, 8, 'int', state.dst_offset);
      cl.setKernelArg(kernel, 9, 'float*', state.dst.buffer.to_gpu());
      cl.setKernelArg(kernel, 10, 'float', state.alpha);
    },
  },
  Xgemm: {
    src: Xgemm_src,
    params: [
      ['MWG', [16, 32, 64, 128]],
      ['NWG', [16, 32, 64, 128]],
      ['KWG', [16, 32]],
      ['MDIMC', [8, 16, 32]],
      ['NDIMC', [8, 16, 32]],
      ['MDIMA', [8, 16, 32]],
      ['NDIMB', [8, 16, 32]],
      ['KWI', [2]],
      ['VWM', [1, 2, 4, 8]],
      ['VWN', [1, 2, 4, 8]],
      ['STRM', [0, 1]],
      ['STRN', [0, 1]],
      ['SA', [0, 1]],
      ['SB', [0, 1]],
    ],
    validate: config => {
      // Requirement for unrolling the KWG loop
      return IsMultiple(config.KWG, config.KWI) &&
        // Required for integer MWI and NWI
        IsMultiple(config.MWG, config.MDIMC * config.VWM) &&
        IsMultiple(config.NWG, config.NDIMC * config.VWN) &&
        // Required for integer MWIA and NWIB
        IsMultiple(config.MWG, config.MDIMA * config.VWM) &&
        IsMultiple(config.NWG, config.NDIMB * config.VWN) &&
        // KWG has to be a multiple of KDIMA = ((MDIMC*NDIMC)/(MDIMA)) and KDIMB = (...)
        IsMultiple(config.KWG, Math.floor(config.MDIMC * config.NDIMC / config.MDIMA)) &&
        IsMultiple(config.KWG, Math.floor(config.MDIMC * config.NDIMC / config.NDIMB)) &&
        // Significantly limits configuration space with likely little performance impact
        config.MDIMC === config.MDIMA &&
        config.NDIMC === config.NDIMB &&
        config.SA === config.SB;
    },
    local: (config) => [config.MDIMC, config.NDIMC],
    global: (config, work) => [work[0] * config.MDIMC / config.MWG, work[1] * config.NDIMC / config.NWG],
    state: {
      M: 2048,
      N: 2048,
      K: 2048,
      alpha: 1,
      beta: 0,
    },
    mem: {
      a: work_size,
      b: work_size,
      dst: work_size,
    },
    setArgs: (kernel, state) => {
      cl.setKernelArg(kernel, 0, 'int', state.M);
      cl.setKernelArg(kernel, 1, 'int', state.N);
      cl.setKernelArg(kernel, 2, 'int', state.K);
      cl.setKernelArg(kernel, 3, 'int', state.alpha);
      cl.setKernelArg(kernel, 4, 'int', state.beta);
      cl.setKernelArg(kernel, 5, 'float*', state.a.buffer.to_gpu());
      cl.setKernelArg(kernel, 6, 'float*', state.b.buffer.to_gpu());
      cl.setKernelArg(kernel, 7, 'float*', state.dst.buffer.to_gpu());
    },
  },
};

// Record the name of each program in the program object
Object.keys(programs).forEach(name => {
  programs[name].name = name;
});

// Parse a configuration string into an object
function parseConfig(str) {
  let obj = {};
  str.split(',').slice(1).forEach(e => {
    let [key, value] = e.split('$');
    obj[key] = value | 0;
  });
  return obj;
}

// Generate all valid configurations for a program
function generateConfigs(program) {
  let list = [];
  function explore(params, partialConfig) {
    let [name, values] = params[0];
    values.forEach(value => {
      let newConfig = partialConfig + ',' + name + '$' + value;
      if (params.length > 1) {
        explore(params.slice(1), newConfig);
        return;
      }
      let config = parseConfig(newConfig);
      if (!program.validate(config)) {
        return;
      }
      list.push(config);
    });
  }
  explore(program.params, program.name);
  return list;
}

// Allocate buffers, run a closure, and then de-allocate them.
let rand;
function withBuffers(program, closure) {
  // restart random number generator
  rand = 0;
  let mem = program.mem;
  let state = program.state;
  Object.keys(mem).forEach(name => {
    let blob = new Blob(mem[name]);
    let size = blob.shape.size;
    // Initialize buffer with data
    let data = new Float32Array(size);
    for (let i = 0; i < size; ++i) {
      data[i] = rand++;
    }
    backend.upload(blob, data);
    state[name] = blob;
  });
  closure();
  // delete the reference to the buffers in state
  Object.keys(mem).forEach(name => {
    let blob = state[name];
    backend.release(blob);
    delete state[name];
  });
}

// Get a full default configuration set
function defaultConfig() {
  let config = {};
  Object.keys(programs).forEach(name => {
    let params = programs[name].params;
    params.forEach(param => {
      config[param[0]] = param[1][0];
    });
  });
  return config;
}

// Measure a configuration of a program.
function measure(program, programConfig) {
  let config = defaultConfig();
  Object.keys(programConfig).forEach(name => {
    config[name] = programConfig[name];
  });
  let time;
  let data;
  withBuffers(program, () => {
    let kernel = backend.clruntime.kernel(program.name, program.src, config);
    try {
      let state = program.state;
      program.setArgs(kernel, state);
      let mem = program.mem;
      let work = work_size;
      let start = Date.now();
      let iter = 0;
      do {
        ++iter;
        backend.clruntime.run(kernel, program.global(config, [work.height, work.width]), program.local(config),
                              Object.keys(mem).map(name => state[name].buffer), state.dst.buffer);
        state.dst.buffer.wait();
      } while ((Date.now() - start) < 100);
      time = (Date.now() - start) / iter;
      data = backend.download(state.dst);
    } catch (e) {
      // mark as error
      time = -1;
      data = [];
    }
  });
  return {
    time: time,
    data: data,
  };
}

// Get the name of the current machine
function queryMachineName() {
  // Allocate a dummy blob to force the backend to spin up the OpenCL driver
  let blob = new Blob(new Shape(1, 1, 1, 16));
  backend.allocate(blob);
  let machine_name = backend.clruntime.deviceInfo.DEVICE_NAME;
  backend.release(blob);
  return machine_name;
}

let db = new MicroDB(path.join(__dirname, 'measurements.txt'));

// Return a string that identifies the result for this program and configuration
function resultKey(programName, config) {
  return [machine_name, work_size.width, work_size.height, float_size, programName].concat(Object.keys(config).map(key => key + '$' + config[key])).join('-');
}

// Get the current system temperature
function temperature() {
  try {
    return require('smc').temperature() | 0;
  } catch (e) {}
  try {
    let t = 0;
    let lines = child_process.execSync('dash', { encoding: 'utf8' }).split('\n');
    lines.forEach(line => {
      let [key, val] = line.trim().split(':');
      if (key === 'pa_therm1') {
        t = val.trim().split(' ')[0];
      }
    });
    return t;
  } catch (e) {}
  return 0;
}

// Print out a report
function report(program) {
  console.log(`machine: ${machine_name}`);
  console.log(`work size: ${work_size.width} ${work_size.height}`);
  console.log(`float size: ${float_size}`);
  let results = [];
  db.keys().forEach(key => {
    let time = db.get(key);
    let parts = key.split('-');
    if (parts[0] !== machine_name || (parts[1] | 0) !== work_size.width ||
	(parts[2] | 0) !== work_size.height || (parts[3] | 0) !== float_size ||
	parts[4] !== program.name) {
      return;
    }
    results.push([(time !== 'error' && time !== 'incorrect') ? (time * 1) : time, parts.slice(5).join(' ').replace(/\$/g, ': ')]);
  });
  results = results.filter(a => typeof a[0] === 'number');
  results = results.sort((a, b) => (a[0] - b[0]));
  results = results.slice(0, 20);
  if (!results.length) {
    console.log('No results available');
    return;
  }
  results.forEach(result => console.log(result[0] + 'ms ' + result[1]));
}

// Maximum temparature, above this we'll pause
let maxTemp = 70;

function tune(program) {
  backend.clruntime.precision = float_size;
  let configs = generateConfigs(program);
  // Get a reference result
  let ref = measure(program, configs[0]);
  let ref_str = ref.data.join(',');
  // See if we already have some results for this run and machine in our database
  let todo = [];
  let best = Infinity;
  configs.forEach((config, n) => {
    let key = resultKey(program.name, config);
    let result = db.get(key);
    if (!result) {
      todo.push(config);
      if (result > 0) {
        best = Math.min(best, result);
      }
    }
  });
  if (!todo.length) {
    report(program);
    return;
  }
  let last = 0;
  let bar = new ProgressBar(':bar :current/:total :percent :etas (last: :last, best: :bestms, :tempC, :status)', { total: configs.length, width: 60 });
  // Account for what we found in the database
  bar.tick(configs.length - todo.length, { last: '-', best: '0', temp: '-', status: 'start' });

  let num = 0; // HACK, REMOVE WHEN WE NO LONGER LEAK

  function next() {
    if (num++ > 10) {
      // HACK, REMOVE WHEN WE NO LONGER LEAK
      throw new Error('time to abort, we are still leaking memory');
    }
    let temp = temperature();
    let status = (temp > maxTemp) ? 'pause' : 'run';
    if (status === 'run') {
      let config = todo.shift();
      let result = measure(program, config);
      if (result.time === -1) {
        result = 'error';
        last = result;
      } else if (ref_str !== result.data.join(',')) {
        result = 'incorrect';
        last = result;
      } else {
        result = Math.round(result.time * 100) / 100;
        last = result + 'ms';
        best = Math.min(best, result);
      }
      db.put(resultKey(program.name, config), result);
    }
    bar.tick((status === 'run') ? 1 : 0, { last: last, best: best, temp: temp, status: status });
    if (bar.complete) {
      report(program);
    } else {
      setTimeout(next, 0);
    }
  }
  next();
}

const commandLineArgs = require('command-line-args');

// Parse command line options
const optionDefinitions = [
  { name: 'kernel', alias: 'k', type: String, defaultOptions: true },
  { name: 'machine', alias: 'm', type: String },
  { name: 'float', alias: 'f', type: String },
  { name: 'width', alias: 'w', type: String },
  { name: 'height', alias: 'h', type: String },
  { name: 'tune', alias: 't', type: Boolean },
];
const options = commandLineArgs(optionDefinitions);
if (!options.kernel) {
  console.log('syntax: node tools/tune.js -k kernel [-t] [-m machine] [-w width] [-h height]');
  console.log('-t: run tuning');
  console.log('-m adreno or irispro');
  console.log('-f 32 or 16');
  console.log('-w N and -h N for work width and height');
  console.log('available kernels:');
  Object.keys(programs).forEach(name => console.log(`  ${name}`));
  return -1;
}
if (!(options.kernel in programs)) {
  console.log(`${options.kernel} is not a supported kernel`);
  return -1;
}
if (options.width) {
  work_size = new Shape(work_size.batch_size, work_size.channels, work_size.height, options.width | 0);
}
if (options.height) {
  work_size = new Shape(work_size.batch_size, work_size.channels, options.height | 0, work_size.width);
}
if (options.machine && options.machine === 'adreno') {
  machine_name = 'QUALCOMM Adreno(TM)';
}
if (options.machine && options.machine === 'irispro') {
  machine_name = 'Iris Pro';
}
if ((options.float | 0) === 16) {
  float_size = 16;
}

let program = programs[options.kernel];
if (options.tune) {
  tune(program);
  return 0;
}
report(program);
