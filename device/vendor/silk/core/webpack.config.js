'use strict';

const path = require('path');
const CopyWebpack = require('copy-webpack-plugin');

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
