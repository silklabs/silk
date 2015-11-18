var path = require('path');
var webpack = require('webpack');

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
  module : {
    loaders: [
      { test: /\.json$/, loader: 'json' },
      {
        test: /\.js$/,
        include: [
          path.resolve(__dirname, 'src'),
          path.resolve(__dirname, 'config.local.json'),
          path.resolve(__dirname, 'node_modules/silk-api'),
        ],
        loaders: ['babel']
      }
    ]
  },
  plugins: [],
}

// TODO: Uglify disabled for now.  The output it produces doesn't load correctly
//config.plugins.push(new webpack.optimize.UglifyJsPlugin({ output: {comments: false} }));

module.exports = config;
