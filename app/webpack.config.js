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
  // Something about how we use relative paths in our modules messes up webpack
  // without a more specific modulesDirectories config.
  resolveLoader: {
    modulesDirectories: [
      path.join(__dirname, 'node_modules'),
    ]
  },
  module: {
    loaders: [
      {
        test: /\.json$/,
        loader: 'json',
      }, {
        test: /\.js$/,
        loader: 'babel',
        query: {
          presets: ['es2015', 'stage-0', 'react'],
          plugins: [],
        },
        include: [
          require('silk-babeldeps'),
          path.resolve(__dirname, 'node_modules/react-native/Libraries/react-native')
        ]
      },
    ],
  },
  plugins: [],
};

// Production config
if (process.env.CONFIGURATION === 'Release') {
  // React Native 0.16+ transforms `__DEV__` out of the minified production
  // bundles, so we should do the same (by replacing the `__DEV__` identifier
  // with the `false` literal and then having uglify eliminate the resulting
  // dead code.)
  config.module.loaders[1].query.plugins.push('./src/transforms/__DEV__-to-false');
  config.plugins.push(new webpack.optimize.DedupePlugin());
  config.plugins.push(new webpack.optimize.UglifyJsPlugin());
}

module.exports = config;
