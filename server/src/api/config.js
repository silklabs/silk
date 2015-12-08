/**
 * Hacks to allow overrides.json and defaults for our configurations.
 *
 * @no-flow
 */
const DEFAULTS = {
  serverUrl: 'https://silk-test-server.herokuapp.com'
};


export default function configure(input) {
  let overrides = {};
  try {
    overrides = require('./overrides.json');
  } catch(err) { //eslint-disable-line
    // No action required...
  }

  let config = Object.assign({}, DEFAULTS, overrides);

  for (var key in input) {
    // Do not allow accidental override of defaults if you want to "null" a
    // config property set it to null.
    if (input[key] === undefined) {
      continue;
    }
    config[key] = input[key];
  }
  return config;
}
