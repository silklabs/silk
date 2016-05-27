'use strict';

const sysutils = require('silk-sysutils');
const MAIN_PROP = 'persist.silk.main';

const main = sysutils.getprop(MAIN_PROP) || 'silk-device-main';
console.log(`initializing silk with main: ${main}`);
require(main);
