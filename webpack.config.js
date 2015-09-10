var fs = require('fs');
var path = require('path');
var webpack = require('webpack');

var config = {

  debug: true,

  devtool: 'source-map',

  entry: {
    'index.ios': ['./Components/Root.js']
  },

  watch: true,

  output: {
    path: path.resolve(__dirname, 'build'),
    filename: '[name].js',
  },

  module: {
    loaders: [
      { test: /\.json$/, loader: 'json' },
      {
        test: /\.js$/,
        include: [
          /** Our Modules */
          path.resolve(__dirname, 'Components'),
          path.resolve(__dirname, 'Libraries'),
          path.resolve(__dirname, 'btle'),
          path.resolve(__dirname, 'config.local.json'),

          /** react-native node_modules */
          path.resolve(__dirname, 'node_modules/react-native-linear-gradient'),
          path.resolve(__dirname, 'node_modules/react-timer-mixin'),
          path.resolve(__dirname, 'node_modules/react-native-button'),
          path.resolve(__dirname, 'node_modules/react-native/Libraries/ART'),
        ],
        loaders: [
          'babel-loader?stage=0&blacklist=validation.react&optional=runtime'
        ]
      },
    ],
  },

  resolve: {
    modulesDirectories: [
      'node_modules',
      path.resolve(__dirname, 'node_modules/react-native/Libraries/ART'),
    ],
    /*
    alias: {
      'ReactNativeART':
        path.resolve(__dirname, 'node_modules/react-native/Libraries/ART/ReactNativeART'),
      'ARTSerializablePath':
        path.resolve(__dirname, 'node_modules/react-native/Libraries/ART/ARTSerializablePath'),
    }
     */
  },

  plugins: [],

};

// Production config
if (process.env.NODE_ENV === 'production') {
  config.plugins.push(new webpack.optimize.OccurrenceOrderPlugin());
  config.plugins.push(new webpack.optimize.UglifyJsPlugin());
}

module.exports = config;
