'use strict';

const path = require('path');
const fs = require('fs');

const findPackage = require('./src/find_package.js');

const webpack = require('webpack');
const resolve = require('resolve');
const mkdirp = require('mkdirp');

// We must place our files in a special folder for integration /w the android
// build system.
const destination = process.env.SILK_BUILDJS_DEST;
const modulePath = findPackage(process.env.SILK_BUILDJS_SOURCE);
const pkg = require(path.join(modulePath, 'package.json'));
const localWebpack = path.join(modulePath, 'webpack.config.js');


let babelCache;
if (!process.env.BABEL_CACHE || process.env.BABEL_CACHE === '1') {
  babelCache = path.join(destination, '../.babelcache');
  mkdirp.sync(babelCache);
} else {
  console.log('~ babel cache has been disabled ~');
  babelCache = false;
}

const name = pkg.name;
let main = pkg.main || './index.js';
if (!path.extname(main)) {
  main += '.js';
}

if (main.indexOf('./') !== 0) {
  main = `./${main}`;
}

const absMain = path.resolve(modulePath, main);
let mainDir;

try {
  mainDir = fs.realpathSync(path.dirname(absMain));
} catch (err) {
  mainDir = path.dirname(absMain);
}

// XXX: Would be nicer to abort this in the bash script rather than after we
// have booted up node here...
if (
  main.indexOf('build/Release') === 0 ||
  main.indexOf('./build/Release') === 0 ||
  /\.node$/.test(main)
) {
  console.log(`Module contains no JS main skipping webpack ...`);
  process.exit(0);
}

if (!main) {
  throw new Error(`package.json must have main in ${process.cwd()}`);
}

const externals = [
  // TODO: auto generate these ...
  'bleno',
  'kissfft',
  'lame',
  'mic',
  'nn.js',
  'noble',
  'node-hid',
  'node-nnpack',
  'node-opencl',
  'node-qsml',
  'node-webrtc',
  'opencv',
  'segfault-handler',
  'silk-alog',
  'silk-audioplayer',
  'silk-battery',
  'silk-bledroid',
  'silk-bsp-version',
  'silk-caffe',
  'silk-camera',
  'silk-core-version',
  'silk-crashreporter',
  'silk-cv',
  'silk-device-api',
  'silk-device-ui',
  'silk-dialog-engine',
  'silk-dialog-script',
  'silk-dialog-storage',
  'silk-factory-reset',
  'silk-gc1',
  'silk-input',
  'silk-audio-dnn',
  'silk-lifx',
  'silk-lights',
  'silk-modwatcher',
  'silk-movie',
  'silk-netstatus',
  'silk-ntp',
  'silk-outbox',
  'silk-process',
  'silk-properties',
  'silk-say',
  'silk-sensors',
  'silk-sonos',
  'silk-speaker',
  'silk-stt',
  'silk-sysutils',
  'silk-tts',
  'silk-update',
  'silk-vad',
  'silk-vibrator',
  'silk-volume',
  'silk-wifi',
  'sodium',
  'v8-profiler',
  (context, request, callback) => {
    if (resolve.isCore(request)) {
      callback(null, true);
      return;
    }

    // For extra fun node will allow resolving .main without a ./ this behavior
    // makes .main look nicer but is completely different than how requiring
    // without a specific path is handled elsewhere... To ensure we don't
    // accidentally resolve a node module to a local file we handle this case
    // very specifically.
    if (context === modulePath && pkg.main === request) {
      const resolvedPath = path.resolve(context, request);
      if (!fs.existsSync(resolvedPath)) {
        callback(new Error(`${modulePath} has a .main which is missing ...`));
        return;
      }
    }

    // Handle path rewriting for native modules
    if (
      /\.node$/.test(request) ||
      request.indexOf('build/Release') !== -1
    ) {
      if (path.isAbsolute(request)) {
        callback(null, true);
        return;
      }

      const absExternalPath = path.resolve(context, request);
      let relativeExternalPath = path.relative(mainDir, absExternalPath);
      if (relativeExternalPath.indexOf('.') !== 0) {
        relativeExternalPath = `./${relativeExternalPath}`;
      }
      callback(null, relativeExternalPath);
      return;
    }

    resolve(request,  {
      basedir: context,
      package: pkg,
      extensions: ['.js', '.json'],
    }, (err, resolvedPath) => {
      if (err) {
        console.log(`Missing module imported from ${context} (${request})`);
        callback(null, true);
        return;
      }
      callback(null, false);
    });
  }
];

const entry = {};
entry[main] = main;

const config = {
  context: modulePath,
  externals,
  target: 'node',
  node: {
    __dirname: false,
    __filename: false,
  },
  devtool: 'source-map',
  entry,
  output: {
    path: path.join(destination),
    libraryTarget: 'commonjs2',
    filename: `[name]`,
  },
  resolve: {
    extensions: ['', '.js', '.json'],
    // Common "gothcha" modules ...
    alias: {
      'any-promise': require.resolve('./shims/any-promise.js'),
      'json3': require.resolve('./shims/json3.js'),
    },
  },
  babel: {
    cacheDirectory: babelCache,
    presets: [
      require('babel-preset-silk-node4'),
    ],
  },
  module : {
    loaders: [
      { test: /\.json$/, loader: require.resolve('json-loader') },
      {
        test: /\.js$/,
        loader: require.resolve('babel-loader'),
        query: {
          babelrc: false,
        }
      }
    ]
  }
}

if (fs.existsSync(localWebpack)) {
  console.log(`${localWebpack} found agumenting buildjs ...`);
  const rules = Object.assign({}, require(localWebpack));
  if (rules.externals && Array.isArray(rules.externals)) {
    // Order is important here the rules should be ordered such that the
    // webpack.config comes from the module first and our global rules second.
    config.externals = rules.externals.concat(config.externals);
    delete rules.externals;
  }
  Object.assign(config, rules);
}

module.exports = config;
