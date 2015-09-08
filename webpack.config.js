module.exports = {
  devServer : {
    contentBase: './public',
    publicPath: '/js/',
  },
  devtool: "source-map",
  entry: './src/index.js',
  output: {
    path: 'public/js',
    filename: 'bundle.js'
  },
  module : {
      loaders: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'babel-loader'
      }
    ]
  }
}
