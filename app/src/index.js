import 'silk-react-native-blobs';
import 'silk-react-native-transformer/globals';

import CrashReporter from './libraries/CrashReporter';
CrashReporter.start();

console.reportErrorsAsExceptions = false; // eslint-disable-line no-console

import {
  AppRegistry,
} from 'react-native';
import Root from './components/Root';

AppRegistry.registerComponent('Silk', () => Root);
