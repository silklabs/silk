/**
 * Provide defaults for our configurations.
 *
 * @noflow
 */

import {branch} from 'silk-core-version';

const DEFAULTS = {
  serverUrl: `https://silk-server-${branch}.herokuapp.com`
};

export default function configure(input) {
  let config = Object.assign({}, DEFAULTS);

  for (let key in input) {
    // Do not allow accidental override of defaults. If you want to "null" a
    // config property, set it to null.
    if (input[key] === undefined) {
      continue;
    }
    config[key] = input[key];
  }
  return config;
}
