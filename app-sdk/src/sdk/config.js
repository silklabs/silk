/**
 * @flow
 */

import merge from 'lodash.merge';
import {configureLog} from 'silk-log';

const defaultConfig = {
  debug: 'silk-*',
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
