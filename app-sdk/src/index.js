/**
 * @flow
 */

import 'silk-react-native-transformer/globals';

// TODO: make this configurable via config.local.json
import {configureLog} from 'silk-log';
configureLog('silk-*');

import startDispatch from './messages/dispatch';
startDispatch();
