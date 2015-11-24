var fs = require('fs');
var path = require('path');
var webpack = require('webpack');

var config = {
  debug: true,
  devtool: 'source-map',
  entry: {
    'index.ios': ['./src/index.ios.js']
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
        loaders: [
          'babel-loader?stage=0&blacklist=validation.react&optional=runtime'
        ]
      },
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
