
import merge from 'lodash.merge';

// Default configuration...
let DEFAULT = {
  'debug': 'silk-*,-silk-*:debug',
};

function load() {
  let config = {};
  try {
    // Note: that to resolve this path correctly it must be passed as string
    // literal
    config = require('../../config.local.json');
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') {
      throw e;
    }
  }
  config = merge({}, DEFAULT, config);
  return config;
}

let config = load();
export default config;

