import merge from 'lodash.merge';

// Default configuration...
let DEFAULT = {
  'debug': 'silk:*',
  'react-native': {},
  'server': {},

  /**
   * Development preferences intended to be overriden in config.local.json
   */
  'preferences': {
    showLiveLag: false,

    // Very verbose socket.io logging!
    socketioLogs: false
  }
};

function load() {
  // XXX: This implementation is strictly tied to react 0.8 if the underlying
  // behavior of error handling changes this may break.
  //
  // In particular we are trying to work around the fact that we cannot catch
  // the error that require raises.
  let globalErr = global.ErrorUtils;
  global.ErrorUtils = null;

  let config = {};
  try {
    // Note: that to resolve this path correctly it must be passed as string
    // literal
    config = require('../config.local.json');
  } catch (e) {
    // No action required...
  }

  config = merge({}, DEFAULT, config);
  global.ErrorUtils = globalErr;
  return config;
}

let config = load();
export default config
