/**
 * @flow
 */

import merge from 'lodash.merge';
import mergeApiDefaultConfig from 'silk-api/src/config';
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

const config = mergeApiDefaultConfig(merge({}, defaultConfig, localConfig));
export default config;

configureLog(config.debug);
