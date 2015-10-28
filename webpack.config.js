var path = require('path');

module.exports = {
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
        exclude: /node_modules/,
        include: [
          path.resolve(__dirname, 'src'),
          path.resolve(__dirname, 'config.local.json'),
          path.resolve(__dirname, 'node_modules/silk-api'),
        ],
        loaders: ['babel']
      }
    ]
  }
}
