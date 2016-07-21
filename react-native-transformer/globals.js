/* eslint-disable */

global.Buffer = require('buffer').Buffer;
global.process = require('process');

// This is to make the `debug` module happy.
if (typeof global.document === 'undefined') {
  global.document = {documentElement: {style: {}}};
}
if (!('userAgent' in global.navigator)) {
  global.navigator.userAgent = 'react-native';
}
