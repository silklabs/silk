// Preset must come first ...
const preset = require('babel-preset-silk-node4');

require('babel-register')({
  presets: [preset]
});
