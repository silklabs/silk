// @flow
'use strict';

const log = require('silk-alog');
const properties = require('silk-properties');

const productName = properties.get('ro.product.name', '(unknown?)');

log.info('Running on a', productName);
setInterval(() => log.verbose('Hello world'), 1000);
