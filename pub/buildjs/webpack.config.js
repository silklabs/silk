'use strict';

const path = require('path');
const fs = require('fs');

const findPackage = require('./src/find_package.js');

const webpack = require('webpack');
const CopyWebpack = require('copy-webpack-plugin');

// We must place our files in a special folder for integration /w the android
// build system.
const destination = `.silkslug`;
const context = findPackage();
const pkg = require(path.join(context, 'package.json'));
const localWebpack = path.join(context, 'webpack.config.js');

const name = pkg.name;
const main = pkg.main;

if (!main) {
  throw new Error(`package.json must have main in ${process.cwd()}`);
}

const config = {
  context,
  target: 'node',
  devtool: 'source-map',
  entry: `./${main}`,
  output: {
    path: path.join(context, destination),
    libraryTarget: 'commonjs2',
    filename: `./${main}`,
  },
  module : {
    loaders: [
      { test: /\.json$/, loader: require.resolve('json-loader') },
      {
        test: /\.js$/,
        loader: require.resolve('babel-loader'),
        query: {
          babelrc: false,
          presets: [
            require.resolve('babel-preset-silk-node4'),
          ],
        }
      }
    ]
  },
  plugins: [new CopyWebpack([
    { from: 'package.json' }
  ])],
}

if (fs.existsSync(localWebpack)) {
  console.log(`${localWebpack} found agumenting buildjs ...`);
  Object.assign(config, require(localWebpack));
}

module.exports = config;
