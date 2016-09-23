'use strict';

const path = require('path');

const EXTERNAL_DIR = path.join(__dirname, 'external');

let config = {
  devServer: {
    contentBase: './public',
    publicPath: '/js/',
  },
  devtool: 'source-map',
  entry: {
    bundle: './src/index',
  },
  output: {
    path: 'public/js',
    filename: '[name].js',
  },
  externals: {
    'silk-alog': true,
  },
  // Something about how we use relative paths in our modules messes up webpack
  // without a more specific modulesDirectories config.
  resolveLoader: {
    modulesDirectories: [
      path.join(__dirname, '../node_modules'),
    ],
  },
  resolve: {
    alias: {
      'fs': path.resolve(__dirname, 'src/shim/fs.js'),
      'net': path.resolve(__dirname, 'src/shim/net.js'),
      'dns': path.resolve(__dirname, 'src/shim/dns.js'),
      'kissfft': path.resolve(__dirname, 'src', 'shim', 'kissfft.js'),
      'react-native': path.resolve(__dirname, 'src', 'shim', 'react-native.js'),
    },
  },
  babel: {
    cacheDirectory: process.env.BABEL_CACHE ? true : false,
    babelrc: false,
    // NOTE: require.resolve will return an absolute path to our babel
    // modules. If we use shorthand or relative path here every module we
    // include must also provide their own version of these presets.
    presets: [
      require('babel-preset-es2015'),
      require('babel-preset-stage-0'),
      require('babel-preset-react'),
    ],
    plugins: [
      require('babel-plugin-transform-runtime'),
    ],
  },
  module: {
    loaders: [
      { test: /\.json$/, loader: require.resolve('json-loader') },
      {
        test: /\.js$/,
        include: (filename) => {
          if (filename.indexOf(EXTERNAL_DIR) === 0) {
            return false;
          }
          return require('silk-babeldeps')(filename);
        },
        loader: require.resolve('babel-loader'),
      },
    ],
  },
  plugins: [],
};

// TODO: Uglify disabled for now.  The output it produces doesn't load correctly
//config.plugins.push(new webpack.optimize.UglifyJsPlugin({ output: {comments: false} }));

module.exports = config;
