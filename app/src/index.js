/**
 * @flow
 */

import 'silk-react-native-blobs';
import 'silk-react-native-transformer/globals';

import CrashReporter from './libraries/CrashReporter';
CrashReporter.start();

import {AppRegistry} from 'react-native';
import {configureLog} from 'silk-log';

import Config from './libraries/config';
import Root from './components/Root';

console.reportErrorsAsExceptions = false; // eslint-disable-line no-console
configureLog(Config.getDefault().debug);
AppRegistry.registerComponent('Silk', () => Root);
