'use strict';

const props = require('silk-properties');
const MAIN_PROP = 'persist.silk.main';

const main = "silk-device-main/.silkslug/core"
console.log(`initializing silk with main: ${main}`);
require(main);
