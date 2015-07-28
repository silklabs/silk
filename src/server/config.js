/**
Deal with loading configuration profiles for the project.
*/

import path from 'path';
import merge from 'lodash.merge';

const LOCAL_CONFIG = 'config.local';

export function loadConfig(profile = 'production', cwd) {
  if (!cwd) {
    cwd = path.join(__dirname, '..', '..', '..');
  }

  // Load order (higher numbers will override lower numbers):
  // 1. default
  // 2. <profile>
  // 3. $cwd/config.local.json
  let defaultConfig = require('../../config/default');
  let profileConfig = require(`../../config/${profile}`);
  let localConfig;
  try {
    localConfig = require(`${path.join(cwd, LOCAL_CONFIG)}`);
  } catch (e) {
    // If there is a syntax error or something we want to raise it.
    if (e.code !== 'MODULE_NOT_FOUND') {
      throw e;
    }
    localConfig = {};
  }

  return merge(defaultConfig, profileConfig, localConfig);
}
