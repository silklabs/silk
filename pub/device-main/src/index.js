// @flow
'use strict';

let createLog = require('silk-log/device');
let log = createLog('device-main');

setInterval(() => log.verbose('Hello world'), 1000);
