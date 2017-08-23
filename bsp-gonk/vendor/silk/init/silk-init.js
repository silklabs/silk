/* @noflow */
'use strict';

const sysutils = require('silk-sysutils');
const MAIN_PROP = 'persist.silk.main';

const main = sysutils.getstrprop(MAIN_PROP, 'silk-device-main');
//eslint-disable-next-line no-console
console.log(`initializing silk with main: ${main}`);
process.title = main;
require(main);
