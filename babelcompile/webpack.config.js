var path = require('path');

module.exports = [
  {
    target: 'node',
    entry: 'babel-register',
    output: {
      libraryTarget: 'commonjs2',
      path: path.join(__dirname, '../babel-register'),
      filename: 'index.js'
    },
    module : {
      loaders: [
        { test: /\.json$/, loader: 'json' },
      ]
    },
  },
  {
    target: 'node',
    entry: 'babel-core',
    output: {
      libraryTarget: 'commonjs2',
      path: path.join(__dirname, '../babel-core'),
      filename: 'index.js'
    },
    module : {
      loaders: [
        { test: /\.json$/, loader: 'json' },
      ]
    },
  }
];
