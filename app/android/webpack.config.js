'use strict';

const path = require('path');
const webpack = require('webpack');

var config = {
  devServer : {
    contentBase: path.join(__dirname, 'app', 'src', 'main', 'assets'),
  },
  devtool: "source-map",
  entry: {
    mse: '../src/android_mse/index',
  },
  output: {
    path: path.join(__dirname, 'app', 'src', 'main', 'assets'),
    filename: '[name].js',
  },
  // Something about how we use relative paths in our modules messes up webpack
  // without a more specific modulesDirectories config.
  resolveLoader: {
    modulesDirectories: [
      path.join(__dirname, '..', '..', 'node_modules'),
    ],
  },
  babel: {
    cacheDirectory: !!process.env.BABEL_CACHE,
    babelrc: false,
    presets: [
      require('babel-preset-es2015'),
      require('babel-preset-stage-0'),
      require('babel-preset-react'),
    ],
    plugins: [
      require('babel-plugin-transform-runtime'),
    ]
  },
  module : {
    loaders: [
      { test: /\.json$/, loader: require.resolve('json-loader') },
      {
        test: /\.js$/,
        include: require('silk-babeldeps'),
        loader: require.resolve('babel-loader'),
      }
    ]
  },
  plugins: [],
}

if (process.env.CONFIGURATION === 'Release') {
  config.plugins.push(new webpack.optimize.UglifyJsPlugin());
}

module.exports = config;
