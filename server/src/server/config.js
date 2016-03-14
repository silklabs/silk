/**
 * Deal with loading configuration profiles for the project.
 */

import path from 'path';
import merge from 'lodash.merge';

const LOCAL_CONFIG = 'config.local';

export default function loadConfig(profile = 'production', cwd) {
  if (!cwd) {
    cwd = path.join(__dirname, '..', '..', '..');
  }

  // XXX: Hack to support both babel6 and babel5 ...
  function resolve(object) {
    if (object.default && typeof object.default === 'object') {
      // babel 6 ...
      return object.default;
    }
    // babel 5 ...
    return object;
  }

  // Load order (higher numbers will override lower numbers):
  // 1. default
  // 2. <profile>
  // 3. $cwd/config.local.json
  let defaultConfig = resolve(require('../../config/default'));
  let profileConfig = resolve(require(`../../config/${profile}`));
  let localConfig;
  try {
    localConfig = resolve(require(`${path.join(cwd, LOCAL_CONFIG)}`));
  } catch (e) {
    // If there is a syntax error or something we want to raise it.
    if (e.code !== 'MODULE_NOT_FOUND') {
      throw e;
    }
    localConfig = {};
  }

  return merge(defaultConfig, profileConfig, localConfig);
}
