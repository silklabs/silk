#!/usr/bin/env node

/**
 * The silk-cli (OSS) does not automatically babel for us so we babel here first
 * before exporting...
 */

// Must require above babel-register...
var preset = require(__dirname + '/../pub/babel-preset-silk-node4');

require(__dirname + '/../pub/babel-register')({
  presets: [preset],
  only: require('silk-babeldeps'),
});

module.exports = require('./src');
