// @flow
'use strict';

const path = require('path');
const log = require('silk-alog');
const wifi = require('silk-wifi').default;
const util = require('silk-sysutils');
const Battery = require('silk-battery').default;
const Movie = require('silk-movie').Movie;

const productName = util.getstrprop('ro.product.name', '(unknown?)');
log.info('Running on a ' + productName);

// Shutdown the device if running out of power so as to not completely drain
// the battery
const battery = new Battery();
battery.init()
.then(() => {
  battery.on('out-of-power', shutdown);
});

let splash = new Movie();
splash.run(path.join(__dirname, 'splash.zip'));

log.info('Initializing wifi');
wifi.init()
.then(() => {
  return wifi.online();
})
.then(() => {
  log.info('Wifi initialized successfully');
  setInterval(() => log.verbose('Hello world'), 1000);
})
.catch((err) => {
  log.error('Failed to initialize', err.stack || err);
  splash.hide();
});

/**
 * Shutdown the device
 */
function shutdown() {
  log.warn('Device ran out of power; shutting down...');
  util.setprop('sys.powerctl', 'shutdown');
}
