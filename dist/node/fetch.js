'use strict';

if (typeof fetch === 'function') {
  module.exports = fetch; //eslint-disable-line
} else {
    module.exports = require('node-fetch');
  }