'use strict';

const CopyWebpack = require('copy-webpack-plugin');
const path = require('path');

// We must place our files in a special folder for integration /w the android
// build system.
const destinationPath = path.resolve(__dirname, '.silkslug');

// TODO: Dynamically build this list from actual externals in build system.
const external = [
  'base_version',
  'bleno',
  'mic',
  'noble',
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
  'silk-movie',
  'silk-ntp',
  'silk-properties',
  'silk-sensors',
  'silk-sysutils',
  'silk-vibrator',
  'silk-wifi',
  'v8-profiler',
].reduce((result, value) => {
  result[value] = true;
  return result;
}, {});

const config = {
  target: 'node',
  node: {
    __dirname: false,
    __filename: false,
  },
  devtool: 'source-map',
  entry: {
    'core': './lib/core.js',
    'btle/child': './lib/btle/child.js',
  },
  output: {
    libraryTarget: 'commonjs2',
    path: destinationPath,
    filename: '[name].js'
  },
  // Something about how we use relative paths in our modules messes up webpack
  // without a more specific modulesDirectories config.
  resolveLoader: {
    modulesDirectories: [
      path.resolve(__dirname, 'node_modules'),
    ],
  },
  resolve: {
    extensions: ['', '.js', '.json'],
    alias: {
      'any-promise': require.resolve('./lib/shims/any-promise.js'),
    },
  },
  // Mark modules installed globally as external.
  externals: [
    external,
  ],
  babel: {
    presets: [
      require('babel-preset-silk-node4'),
    ],
  },
  module: {
    loaders: [
      {
        test: /\.json$/,
        loader: require.resolve('json-loader')
      },
      {
        test: /\.js$/,
        loader: require.resolve('babel-loader'),
        query: {
          babelrc: false,
        },
        only: [
          require.resolve('silk-babeldeps'),
        ],
      }
    ],
  },
  plugins: [
    new CopyWebpack([{ from:'package.json'}]),
  ],
};

module.exports = config;
