var path = require('path');
var webpack = require('webpack');

var config = {
  devServer : {
    contentBase: './public',
    publicPath: '/js/',
  },
  devtool: "source-map",
  entry: ['babel-polyfill', './lib/www/index'],
  output: {
    path: 'public/js',
    filename: 'bundle.js'
  },
  module : {
    loaders: [
      { test: /\.json$/, loader: 'json' },
      {
        test: /\.js$/,
        loader: 'babel',
        query: {
          presets: ['es2015', 'stage-0', 'react'],
        },
        include: require('silk-babeldeps'),
      }
    ]
  },
  plugins: [
    // Ignore octokat's require('xmlhttprequest')
    new webpack.IgnorePlugin(new RegExp("^(xmlhttprequest)$")),
  ]
}

module.exports = config;
