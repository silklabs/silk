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
  // Something about how we use relative paths in our modules messes up webpack
  // without a more specific modulesDirectories config.
  resolveLoader: {
    modulesDirectories: [
      path.join(__dirname, 'node_modules'),
    ]
  },
  resolve: {
    alias : {
      'react-native': path.resolve(__dirname, 'src', 'shim', 'ReactNative.js'),
      'NativeModules': path.resolve(__dirname, 'src', 'shim', 'NativeModules.js'),
    },
  },
  module : {
    loaders: [
      { test: /\.json$/, loader: 'json' },
      {
        test: /\.js$/,
        include: require('babelfilter'),
        loaders: ['babel-loader?stage=0&optional=runtime'],
      }
    ]
  },
  plugins: [],
}

// TODO: Uglify disabled for now.  The output it produces doesn't load correctly
//config.plugins.push(new webpack.optimize.UglifyJsPlugin({ output: {comments: false} }));

module.exports = config;
