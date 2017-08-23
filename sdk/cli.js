/**
 * Note that this might be run with babel-node OR inside a production
 * environment with babel assets compiled so we detect this and run
 * the appropriate steps.
 *
 * @noflow
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'babelconfig.js');
const COMPILE_ROOT = path.join(__dirname, 'src');

if (fs.existsSync(CONFIG_PATH)) {
  let config = require('./babelconfig')();
  let preset = require(config.preset);
  require(config.register)({
    presets: [preset],
    // Be strict! We only want to include what is in our own src/*. For
    // usage where you do not want to use a precompile step, an additional
    // babel-register can be used for those files.
    only: (file) => !file.includes('node_modules') &&
      file.startsWith(COMPILE_ROOT),
  });
  module.exports = require('./src/cli');
} else {
  module.exports = require('./build/cli');
}
