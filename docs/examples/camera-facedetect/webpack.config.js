const CopyWebpack = require('copy-webpack-plugin');
module.exports = {
  plugins: [
    new CopyWebpack([
      { from: './node_modules/opencv/data/haarcascade_frontalface_alt.xml', to: '.' },
    ]),
  ]
};
