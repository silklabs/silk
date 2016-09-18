/* eslint-disable silk/flow */

'use strict';

let webpack = require('webpack');

let config = {
  devServer: {
    contentBase: './public',
    publicPath: '/js/',
  },
  devtool: 'source-map',
  entry: ['babel-polyfill', './lib/www/index'],
  output: {
    path: 'public/js',
    filename: 'bundle.js',
  },
  babel: {
    presets: [
      require('babel-preset-es2015'),
      require('babel-preset-stage-0'),
      require('babel-preset-react'),
    ],
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
        include: require('silk-babeldeps'),
      },
    ],
  },
  plugins: [
    // Ignore octokat's require('xmlhttprequest')
    new webpack.IgnorePlugin(new RegExp('^(xmlhttprequest)$')),
  ],
};

module.exports = config;
