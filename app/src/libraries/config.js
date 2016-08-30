/**
 * @flow
 */

import merge from 'lodash.merge';
import {configureLog} from 'silk-log';

const defaultConfig = {
  'debug': 'silk-*',
  'react-native': {},
  'server': {
    choices: [
      {name: 'US East', value: '' /* use API default server */ },
    ],
    // The following are only visible when showDevServers is true
    devChoices: [
      {name: 'localhost', value: 'http://localhost:5000'},
      {name: 'master', value: 'https://silk-server-master.herokuapp.com'},
      {name: 'next', value: 'https://silk-server-next.herokuapp.com'},
      {name: 'release', value: 'https://silk-server-release.herokuapp.com'},
    ],
  },

  showServerPicker: true,

  // If `true`, list server.devChoices in the server picker as well
  showDevServers: false,
};

let localConfig;
try {
  localConfig = require('../../../config.local.json');
} catch (ex) {
  localConfig = {};
}

const config = merge({}, defaultConfig, localConfig);
export default config;

configureLog(config.debug);
// $FlowFixMe: reportErrorsAsExceptions is unknown to flow.
console.reportErrorsAsExceptions = false; // eslint-disable-line no-console
