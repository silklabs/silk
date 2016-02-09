var config = require('../babelconfig')();
var preset = require(config.preset);
require(config.register)({
  presets: [preset],
});
