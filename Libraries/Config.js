import merge from 'lodash.merge';

// Default configuration...
let DEFAULT = {
  'debug': 'silk-*,-silk-*:debug',
  'react-native': {},
  'server': {},

  /**
   * Development preferences intended to be overriden in config.local.json
   */
  'preferences': {
    showLiveLag: false,

    // Very verbose socket.io logging!
    socketioLogs: false,
  },
};

function load() {
  let config = {};
  try {
    // Note: that to resolve this path correctly it must be passed as string
    // literal
    config = require('../config.local.json');
  } catch (e) {
    /* eslint no-empty:0 */
    // No action required...
  }
  config = merge({}, DEFAULT, config);
  return config;
}

let config = load();
export default config;
