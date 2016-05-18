var fs = require('fs');
var path = require('path');
var webpack = require('webpack');
var cloneDeep = require('lodash.clonedeep');

var base = {
  debug: true,
  devtool: 'source-map',
  entry: {},
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
  resolve: {
    extensions: ['', '.js', '.json'],
    alias: {
      // joi imports 'net' and 'dns' which webpack doesn't automatically browserify.
      dns: require.resolve('./src/shims/dns.js'),
      net: require.resolve('./src/shims/net.js'),
    },
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
          babelrc: false,
          // NOTE: require.resolve will return an absolute path to our babel
          // modules. If we use shorthand or relative path here every module we
          // include must also provide their own version of these presets.
          presets: [
            require.resolve('babel-preset-es2015'),
            require.resolve('babel-preset-stage-0'),
            require.resolve('babel-preset-react'),
          ],
          plugins: [
            require.resolve('babel-plugin-transform-runtime')
          ]
        },
        include: [
          require('../babeldeps'),
        ]
      },
    ],
  },
  plugins: [],
};

function makeConfig(platform) {
  var config = cloneDeep(base);
  config.entry['index.' + platform] = ['./src/index.js'];
  config.resolve.extensions.push('.' + platform + '.js');

  if (process.env.CONFIGURATION === 'Release') {
    // React Native 0.16+ transforms `__DEV__` out of the minified production
    // bundles, so we should do the same (by replacing the `__DEV__` identifier
    // with the `false` literal and then having uglify eliminate the resulting
    // dead code.)
    config.module.loaders[1].query.plugins.push('./src/transforms/__DEV__-to-false');
    config.module.loaders[1].query.plugins.push('./src/transforms/remove-logging');
    config.plugins.push(new webpack.optimize.DedupePlugin());
    config.plugins.push(new webpack.optimize.UglifyJsPlugin());
  } else {
    config.module.loaders[1].query.plugins.push('./src/transforms/assert-messages');
  }
  return config;
}

var configs = [];
if (process.argv.indexOf('--no-ios') === -1) {
  configs.push(makeConfig('ios'));
}
if (process.argv.indexOf('--no-android') === -1) {
  configs.push(makeConfig('android'));
}
module.exports = configs;
