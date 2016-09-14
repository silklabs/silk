/**
 * @noflow
 */

const DEFAULT = {
  'debug': 'silk-*,-silk-*:debug',
};

let config;
try {
  // Note: that to resolve this path correctly it must be passed as string
  // literal
  config = require('../../../config.local.json');
} catch (e) {
  if (e.code !== 'MODULE_NOT_FOUND') {
    throw e;
  }
}
config = Object.assign({}, DEFAULT, config);
module.exports = config;
