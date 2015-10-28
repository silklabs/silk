var fs = require('fs');
var path = require('path');
var webpack = require('webpack');

var config = {

  debug: true,

  devtool: 'source-map',

  entry: {
    'index.ios': ['./src/index.js']
  },

  watch: true,

  output: {
    path: path.resolve(__dirname, 'build'),
    filename: '[name].js',
  },

  module: {
    loaders: [
      {test: /\.js$/, exclude: /node_modules/, loaders: ['babel?stage=0&blacklist=validation.react']},
    ],
  },

  plugins: [],

};

// Production config
if (process.env.NODE_ENV === 'production') {
  config.plugins.push(new webpack.optimize.OccurrenceOrderPlugin());
  config.plugins.push(new webpack.optimize.UglifyJsPlugin());
}

module.exports = config;
