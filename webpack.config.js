var path = require('path');
var webpack = require('webpack');


var config = {
  devServer : {
    contentBase: './public',
    publicPath: '/js/',
  },
  devtool: "source-map",
  entry: './lib/www/index',
  output: {
    path: 'public/js',
    filename: 'bundle.js'
  },
  module : {
    loaders: [
      { test: /\.json$/, loader: 'json' },
      {
        test: /\.js$/,
        include: [
          path.resolve(__dirname, 'lib'),
        ],
        loaders: ['babel']
      }
    ]
  },
  plugins: [
    // Ignore octokat's require('xmlhttprequest')
    new webpack.IgnorePlugin(new RegExp("^(xmlhttprequest)$")),
  ]
}

module.exports = config;
