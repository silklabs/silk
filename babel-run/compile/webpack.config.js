/* @noflow */
const path = require('path');

module.exports = [
  {
    target: 'node',
    entry: 'babel-register',
    output: {
      libraryTarget: 'commonjs2',
      path: path.join(__dirname, '..'),
      filename: 'babel-register.js',
    },
    module: {
      loaders: [
        {test: /\.json$/, loader: 'json'},
      ],
    },
  },
];
