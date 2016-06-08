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
const babelCache = path.join(destination, '../.babelcache');
const modulePath = findPackage(process.env.SILK_BUILDJS_SOURCE);
const pkg = require(path.join(modulePath, 'package.json'));
const localWebpack = path.join(modulePath, 'webpack.config.js');

mkdirp.sync(babelCache);

const name = pkg.name;
let main = pkg.main || './index.js';
if (!path.extname(main)) {
  main += '.js';
}

if (main.indexOf('./') !== 0) {
  main = `./${main}`;
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
  'base_version',
  'bleno',
  'mic',
  'noble',
  'node-hid',
  'node-webrtc',
  'opencv',
  'segfault-handler',
  'silk-alog',
  'silk-battery',
  'silk-camera',
  'silk-core-version',
  'silk-cv',
  'silk-gc1',
  'silk-input',
  'silk-lights',
  'silk-modwatcher',
  'silk-movie',
  'silk-netstatus',
  'silk-ntp',
  'silk-properties',
  'silk-sensors',
  'silk-sysutils',
  'silk-vibrator',
  'silk-volume',
  'silk-wifi',
  'v8-profiler',
  'kissfft',
  'silk-caffe',
  /\.node$/,
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
