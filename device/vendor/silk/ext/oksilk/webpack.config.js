const CopyWebpack = require('copy-webpack-plugin');

module.exports = {
  plugins: [
    new CopyWebpack([
      { from: 'hotkeyword_detected.mp3' },
    ]),
  ]
};
