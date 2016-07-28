/**
 * @flow
 */

// Install globals and set defaults for logging.
import 'silk-react-native-blobs';
import 'silk-react-native-transformer/globals';
import './libraries/config';
import './libraries/profiling';

import {AppRegistry} from 'react-native';
import Root from './components/Root';
import CrashReporter from './libraries/CrashReporter';

CrashReporter.start();
AppRegistry.registerComponent('Silk', () => Root);
