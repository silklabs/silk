// @flow
'use strict';

const log = require('silk-alog');
const wifi = require('silk-wifi').default;
const util = require('silk-sysutils');

const productName = util.getstrprop('ro.product.name', '(unknown?)');

log.info('Running on a ' + productName);

log.info('Initializing wifi');
wifi.init()
.then(function() {
  return wifi.online();
})
.then(function() {
  log.info('Wifi initialized successfully');
  setInterval(() => log.verbose('Hello world'), 1000);
})
.catch(function(err) {
  log.error('Failed to initialize', err.stack || err);
});

