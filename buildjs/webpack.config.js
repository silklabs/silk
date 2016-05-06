'use strict';

const path = require('path');
const webpack = require('webpack');
const findPackage = require('./src/find_package.js');

const CopyWebpack = require('copy-webpack-plugin');

// We must place our files in a special folder for integration /w the android
// build system.
const destination = `.silkslug`;
const context = findPackage();
const pkg = require(path.join(context, 'package.json'));

const name = pkg.name;

// XXX: The way we deal with main should be considered legacy.
const main = pkg.main;

if (!main) {
  throw new Error(`package.json must have main in ${process.cwd()}`);
}

module.exports = {
  context,
  target: 'node',
  devtool: 'source-map',
  entry: `./lib/${main}`,
  output: {
    path: path.join(context, destination),
    libraryTarget: 'commonjs2',
    filename: `./${main}`,
  },
  module : {
    loaders: [
      { test: /\.json$/, loader: require.resolve('json-loader') },
      { test: /\.js$/, loader: require.resolve('babel-loader') }
    ]
  },
  plugins: [new CopyWebpack([
    { from: 'package.json' }
  ])],
}
