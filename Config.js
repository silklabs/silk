// Default configuration...
let DEFAULT = {
  'react-native': {},
  'server': {
    'url': 'silk-test-server.herokuapp.com'
  }
};

export default function load() {
  // XXX: This implementation is strictly tied to react 0.8 if the underlying
  // behavior of error handling changes this may break.
  //
  // In particular we are trying to work around the fact that we cannot catch
  // the error that require raises.
  let globalErr = global.ErrorUtils;
  global.ErrorUtils = null;

  let config;
  try {
    // Note: that to resolve this path correctly it must be passed as string
    // literal
    config = require('./config.local.json');
  } catch (e) {
    config = DEFAULT;
  }

  config.server = config.server || DEFAULT.server;
  global.ErrorUtils = globalErr;
  return config;
}
