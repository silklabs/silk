'use strict';

const path = require('path');
const webpack = require('webpack');

const EXTERNAL_DIR = path.join(__dirname, 'external');

var config = {
  devServer : {
    contentBase: './public',
    publicPath: '/js/',
  },
  devtool: "source-map",
  entry: './src/index',
  output: {
    path: 'public/js',
    filename: 'bundle.js'
  },
  // Something about how we use relative paths in our modules messes up webpack
  // without a more specific modulesDirectories config.
  resolveLoader: {
    modulesDirectories: [
      path.join(__dirname, 'node_modules'),
    ],
  },
  resolve: {
    alias : {
      'fs': path.resolve(__dirname, 'src/shim/fs.js'),
      'react-native': path.resolve(__dirname, 'src', 'shim', 'ReactNative.js'),
      'NativeModules': path.resolve(__dirname, 'src', 'shim', 'NativeModules.js'),
    },
  },
  module : {
    loaders: [
      { test: /\.json$/, loader: 'json' },
      {
        test: /\.js$/,
        include: (filename) => {
          if (filename.indexOf(EXTERNAL_DIR) === 0) {
            return false;
          }
          return require('silk-babeldeps')(filename);
        },
        loader: 'babel',
        query: {
          babelrc: false,
          // NOTE: require.resolve will return an absolute path to our babel
          // modules. If we use shorthand or relative path here every module we
          // include must also provide their own version of these presets.
          presets: [
            require.resolve('babel-preset-es2015'),
            require.resolve('babel-preset-stage-0'),
            require.resolve('babel-preset-react'),
          ],
          plugins: [
            require.resolve('babel-plugin-transform-runtime')
          ]
        },
      }
    ]
  },
  plugins: [],
}

// TODO: Uglify disabled for now.  The output it produces doesn't load correctly
//config.plugins.push(new webpack.optimize.UglifyJsPlugin({ output: {comments: false} }));

module.exports = config;
