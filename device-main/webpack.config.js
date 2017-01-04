/* eslint-disable flowtype/require-valid-file-annotation */
const CopyWebpack = require('copy-webpack-plugin');

module.exports = {
  plugins: [
    new CopyWebpack([
      {from: 'splash.zip', to: 'splash.zip'},
    ]),
  ],
};
