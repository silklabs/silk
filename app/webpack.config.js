var fs = require('fs');
var path = require('path');
var webpack = require('webpack');

var config = {
  debug: true,
  devtool: 'source-map',
  entry: {
    'index.ios': ['./src/index.ios.js'],
  },
  watch: true,
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: '[name].js',
  },
  module: {
    loaders: [
      {
        test: /\.json$/,
        loader: 'json',
      }, {
        test: /\.js$/,
        include: [
          path.resolve(__dirname, 'src'),
          path.resolve(__dirname, 'node_modules/silk-api'),
        ],
        loader: 'babel',
        query: {
          presets: ['es2015', 'stage-0', 'react'],
        },
      },
    ],
  },
  plugins: [],
};

// Production config
if (process.env.CONFIGURATION === 'Release') {
  config.plugins.push(new webpack.optimize.DedupePlugin());
  config.plugins.push(new webpack.optimize.UglifyJsPlugin());
}

module.exports = config;
