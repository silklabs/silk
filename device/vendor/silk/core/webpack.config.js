'use strict';

const path = require('path');

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
  'silk-core-version',
  'silk-cv',
  'silk-gc1',
  'silk-movie',
  'silk-properties',
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
  },
  output: {
    libraryTarget: 'commonjs2',
    path: path.resolve(__dirname, 'dist'),
    filename: './lib/[name].js'
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
          presets: [
            require.resolve('babel-preset-silk-node4'),
          ],
        },
        only: [
          require.resolve('silk-babeldeps'),
        ],
      }
    ],
  },
  plugins: [
  ],
};

module.exports = config;
