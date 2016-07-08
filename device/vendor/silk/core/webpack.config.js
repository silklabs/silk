'use strict';

const path = require('path');
const CopyWebpack = require('copy-webpack-plugin');

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
  'sodium',
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
    'lib/core.js': './lib/core.js',
    'lib/btle/child.js': './lib/btle/child.js',
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
      'json3': require.resolve('./lib/shims/json3.js'),
    },
  },
  // Mark modules installed globally as external.
  externals: [
    external,
  ],
  module: {
    loaders: [
      {
        test: /\.json$/,
        loader: require.resolve('json-loader'),
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
      },
    ],
  },
  plugins: [
    new CopyWebpack([{ from: 'media', 'to': 'media' }]),
  ],
};

module.exports = config;
