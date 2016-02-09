var path = require('path');

module.exports = [
  {
    target: 'node',
    entry: './staging/register.js',
    output: {
      libraryTarget: 'commonjs2',
      path: __dirname,
      filename: 'register.js'
    },
    module : {
      loaders: [
        { test: /\.json$/, loader: 'json' },
      ]
    },
  }
];
