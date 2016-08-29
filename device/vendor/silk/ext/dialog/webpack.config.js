/* eslint-disable silk/flow */
const CopyWebpack = require('copy-webpack-plugin');

module.exports = {
  plugins: [
    new CopyWebpack([
      { from: 'media', to: 'media' },
    ]),
  ],
};
