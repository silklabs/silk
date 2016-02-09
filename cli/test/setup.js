var presetPath = require('../babel_preset')();
var preset = require(presetPath);
require('babel-register')({
  options: {
    presets: [preset],
  },
});
