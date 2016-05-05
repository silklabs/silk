'use strict';

const props = require('silk-properties');
const MAIN_PROP = 'persist.silk.main';

const main = props.get(MAIN_PROP) || 'silk-device-main';
console.log(`initializing silk with main: ${main}`);
require(main);
