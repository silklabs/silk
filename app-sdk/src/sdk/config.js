/**
 * @flow
 */

import merge from 'lodash.merge';
import {configureLog} from 'silk-log';

const defaultConfig = {
  debug: 'silk-*,-silk-*:debug',
};

let localConfig;
try {
  localConfig = require('../../config.local.json');
} catch (ex) {
  localConfig = {};
}

const config = merge({}, defaultConfig, localConfig);
export default config;

configureLog(config.debug);
