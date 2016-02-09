/**
 * Note that this might be run with babel-node OR inside a production
 * environment with babel assets compiled so we detect this and run
 * the appropriate steps.
 */

const fs = require('fs');
const path = require('path');

// XXX: This might fail in npm3 situations where cli is somehow embedded into
// your project without being built which should never happen.
const REGISTER_PATH = path.join(__dirname, 'node_modules', 'babel-register');

if (fs.existsSync(REGISTER_PATH)) {
  require('babel-register');
  module.exports = require('./src');
} else {
  module.exports = require('./build');
}
