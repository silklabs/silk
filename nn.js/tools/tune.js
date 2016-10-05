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

let M = 2048, N = 2048, K = 2048;
let float_size = 32;
let machine_name = queryMachineName();

const programs = {
  CopyMatrixFast: {
    params: [
      ['COPY_DIMX', [8, 16, 32]],
      ['COPY_DIMY', [8, 16, 32]],
      ['COPY_WPT', [1, 2, 4, 8]],
      ['COPY_VW', [1, 2, 4, 8]],
    ],
    validate: config => {
      return config.COPY_DIMX <= M &&
        config.COPY_DIMY <= N;
    },
    local: (config) => [config.COPY_DIMX, config.COPY_DIMY],
    global: (config, work) => [work[0] / config.COPY_VW, work[1] / config.COPY_WPT],
    state: (M, N, K) => ({
      src_ld: M, // guaranteed alignment for this kernel
      alpha: 1, // we don't really care about different values for alpha for now
    }),
    mem: (M, N, K) => ({
      src: new Shape(1, 1, M, N),
      dst: new Shape(1, 1, M, N),
    }),
    setArgs: (kernel, state, blobs) => {
      cl.setKernelArg(kernel, 0, 'int', state.src_ld);
      cl.setKernelArg(kernel, 1, 'float*', blobs.src.buffer.to_gpu());
      cl.setKernelArg(kernel, 2, 'float*', blobs.dst.buffer.to_gpu());
      cl.setKernelArg(kernel, 3, 'float', state.alpha);
    },
  },
  CopyPadMatrix: {
    params: [
      ['PAD_DIMX', [8, 16, 32]],
      ['PAD_DIMY', [8, 16, 32]],
      ['PAD_WPTX', [1, 2, 4]],
      ['PAD_WPTY', [1, 2, 4]],
    ],
    validate: config => {
      return config.PAD_DIMX <= M &&
        config.PAD_DIMY <= N;
    },
    local: (config) => [config.PAD_DIMX, config.PAD_DIMY],
    global: (config, work) => [work[0] / config.PAD_WPTX, work[1] / config.PAD_WPTY],
    state: (M, N, K) => ({
      src_one: M,
      src_two: N,
      src_ld: M,
      src_offset: 0,
      dst_one: M,
      dst_two: N,
      dst_ld: M,
      dst_offset: 0,
      alpha: 1,
    }),
    mem: (M, N, K) => ({
      src: new Shape(1, 1, M, N),
      dst: new Shape(1, 1, M, N),
    }),
    setArgs: (kernel, state, blobs) => {
      cl.setKernelArg(kernel, 0, 'int', state.src_one);
      cl.setKernelArg(kernel, 1, 'int', state.src_two);
      cl.setKernelArg(kernel, 2, 'int', state.src_ld);
      cl.setKernelArg(kernel, 3, 'int', state.src_offset);
      cl.setKernelArg(kernel, 4, 'float*', blobs.src.buffer.to_gpu());
      cl.setKernelArg(kernel, 5, 'int', state.dst_one);
      cl.setKernelArg(kernel, 6, 'int', state.dst_two);
      cl.setKernelArg(kernel, 7, 'int', state.dst_ld);
      cl.setKernelArg(kernel, 8, 'int', state.dst_offset);
      cl.setKernelArg(kernel, 9, 'float*', blobs.dst.buffer.to_gpu());
      cl.setKernelArg(kernel, 10, 'float', state.alpha);
    },
  },
  TransposeMatrixFast: {
    params: [
      ['TRA_DIM', [4, 8, 16, 32, 64]],
      ['TRA_WPT', [1, 2, 4, 8, 16]],
      ['TRA_PAD', [0, 1]],
      ['TRA_SHUFFLE', [0, 1]],
    ],
    validate: config => {
      return config.TRA_DIM <= M &&
        config.TRA_DIM <= N;
    },
    local: (config) => [config.TRA_DIM, config.TRA_DIM],
    global: (config, work) => [work[0] / config.TRA_WPT, work[1] / config.TRA_WPT],
    state: (M, N, K) => ({
      ld: M,
      alpha: 1,
    }),
    mem: (M, N, K) => ({
      src: new Shape(1, 1, M, N),
      dst: new Shape(1, 1, M, N),
    }),
    setArgs: (kernel, state, blobs) => {
      cl.setKernelArg(kernel, 0, 'int', state.ld);
      cl.setKernelArg(kernel, 1, 'float*', blobs.src.buffer.to_gpu());
      cl.setKernelArg(kernel, 2, 'float*', blobs.dst.buffer.to_gpu());
      cl.setKernelArg(kernel, 3, 'float', state.alpha);
    },
  },
  TransposePadMatrix: {
    params: [
      ['PADTRA_TILE', [8, 16, 32, 64]],
      ['PADTRA_WPT', [1, 2, 4, 8, 16]],
      ['PADTRA_PAD', [0, 1]],
    ],
    validate: config => {
      return config.PADTRA_TILE <= M &&
        config.PADTRA_TILE <= N;
    },
    local: (config) => [config.PADTRA_TILE, config.PADTRA_TILE],
    global: (config, work) => [work[0] / config.PADTRA_WPT, work[1] / config.PADTRA_WPT],
    state: (M, N, K) => ({
      src_one: M,
      src_two: N,
      src_ld: M,
      src_offset: 0,
      dst_one: M,
      dst_two: N,
      dst_ld: M,
      dst_offset: 0,
      alpha: 1,
    }),
    mem: (M, N, K) => ({
      src: new Shape(1, 1, M, N),
      dst: new Shape(1, 1, M, N),
    }),
    setArgs: (kernel, state, blobs) => {
      cl.setKernelArg(kernel, 0, 'int', state.src_one);
      cl.setKernelArg(kernel, 1, 'int', state.src_two);
      cl.setKernelArg(kernel, 2, 'int', state.src_ld);
      cl.setKernelArg(kernel, 3, 'int', state.src_offset);
      cl.setKernelArg(kernel, 4, 'float*', blobs.src.buffer.to_gpu());
      cl.setKernelArg(kernel, 5, 'int', state.dst_one);
      cl.setKernelArg(kernel, 6, 'int', state.dst_two);
      cl.setKernelArg(kernel, 7, 'int', state.dst_ld);
      cl.setKernelArg(kernel, 8, 'int', state.dst_offset);
      cl.setKernelArg(kernel, 9, 'float*', blobs.dst.buffer.to_gpu());
      cl.setKernelArg(kernel, 10, 'float', state.alpha);
    },
  },
  Xgemm: {
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
        config.SA === config.SB &&
        // Additionally check against M, N, K
        config.MWG <= M &&
        config.NWG <= N &&
        config.KWG <= K;
    },
    local: (config) => [config.MDIMC, config.NDIMC],
    global: (config, work) => [work[0] * config.MDIMC / config.MWG, work[1] * config.NDIMC / config.NWG],
    state: (M, N, K) => ({
      M: M,
      N: N,
      K: K,
      alpha: 1,
      beta: 0,
    }),
    mem: (M, N, K) => ({
      a: new Shape(1, 1, M, K),
      b: new Shape(1, 1, N, K),
      dst: new Shape(1, 1, M, N),
    }),
    setArgs: (kernel, state, blobs) => {
      cl.setKernelArg(kernel, 0, 'int', state.M);
      cl.setKernelArg(kernel, 1, 'int', state.N);
      cl.setKernelArg(kernel, 2, 'int', state.K);
      cl.setKernelArg(kernel, 3, 'int', state.alpha);
      cl.setKernelArg(kernel, 4, 'int', state.beta);
      cl.setKernelArg(kernel, 5, 'float*', blobs.a.buffer.to_gpu());
      cl.setKernelArg(kernel, 6, 'float*', blobs.b.buffer.to_gpu());
      cl.setKernelArg(kernel, 7, 'float*', blobs.dst.buffer.to_gpu());
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
function withBlobs(program, closure) {
  let blobs = {};
  // restart random number generator
  rand = 0;
  let mem = program.mem(M, N, K);
  Object.keys(mem).forEach(name => {
    let blob = new Blob(mem[name]);
    let size = blob.shape.size;
    // Initialize buffer with data
    let data = new Float32Array(size);
    for (let i = 0; i < size; ++i) {
      data[i] = rand++;
    }
    backend.upload(blob, data);
    blobs[name] = blob;
  });
  closure(blobs);
  // delete the reference to the buffers in state
  Object.keys(mem).forEach(name => {
    let blob = blobs[name];
    backend.release(blob);
    delete blobs[name];
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
  withBlobs(program, blobs => {
    try {
      let kernel = backend.clruntime.kernel(program.name, config);
      let state = program.state(M, N, K);
      program.setArgs(kernel, state, blobs);
      let start = Date.now();
      let iter = 0;
      do {
        ++iter;
        backend.clruntime.run(kernel, program.global(config, [M, N]), program.local(config),
                              Object.keys(blobs).map(name => blobs[name].buffer), blobs.dst.buffer);
        blobs.dst.buffer.wait();
      } while ((Date.now() - start) < 100);
      time = (Date.now() - start) / iter;
      data = backend.download(blobs.dst);
    } catch (e) {
      console.log(e);
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
  return [machine_name, M, N, K, float_size, programName].concat(Object.keys(config).map(key => key + '$' + config[key])).join('-');
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
  console.log(`M N K: ${M} ${N} ${K}`);
  console.log(`float size: ${float_size}`);
  let results = [];
  db.keys().forEach(key => {
    let time = db.get(key);
    let parts = key.split('-');
    if (parts[0] !== machine_name || (parts[1] | 0) !== M ||
	(parts[2] | 0) !== N || (parts[3] | 0) !== K || (parts[4] | 0) !== float_size ||
	parts[5] !== program.name) {
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

let tick = (bar, total, n, count, last, best, temp, status) => {
  bar.tick(count, { last: last, best: best, temp: temp, status: status });
};

// Maximum temparature, above this we'll pause
let maxTemp = 70;

let stop = 0;

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
  tick(bar, configs.length, todo.length, configs.length - todo.length, '-', '0', '-', 'start');

  function next() {
    if (stop++ > 100) {
      throw new Error('STOP');
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
    tick(bar, configs.length, todo.length, (status === 'run') ? 1 : 0, last, best, temp, status);
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
  { name: 'M', alias: 'M', type: String },
  { name: 'N', alias: 'N', type: String },
  { name: 'K', alias: 'K', type: String },
  { name: 'tune', alias: 't', type: Boolean },
  { name: 'logcat', alias: 'l', type: Boolean },
];
const options = commandLineArgs(optionDefinitions);
if (!options.kernel) {
  console.log('syntax: node tools/tune.js -k kernel [-t] [-m machine] [-w width] [-h height]');
  console.log('-t: run tuning');
  console.log('-m adreno or irispro');
  console.log('-f 32 or 16');
  console.log('-M m and -N n and -K k to change input sizes');
  console.log('-l set output to logcat instead of the console');
  console.log('available kernels:');
  Object.keys(programs).forEach(name => console.log(`  ${name}`));
  return -1;
}
if (!(options.kernel in programs)) {
  console.log(`${options.kernel} is not a supported kernel`);
  return -1;
}
if (options.M) {
  M = options.M | 0;
}
if (options.N) {
  N = options.N | 0;
}
if (options.K) {
  K = options.K | 0;
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
if (options.logcat) {
  // redirect console.log
  console.log = msg => {
    msg = '' + msg;
    try {
      child_process.execSync(`/system/bin/log "tune ${msg}"`);
    } catch (e) { }
  };
  // and redirect the result ticks
  tick = (bar, total, n, count, last, best, temp, status) => {
    console.log([total, n, count, last, best, temp, status].join(' '));
  };
}

let program = programs[options.kernel];
if (options.tune) {
  tune(program);
  return 0;
}
report(program);
