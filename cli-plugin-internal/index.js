#!/usr/bin/env node

/**
 * The silk-cli (OSS) does not automatically babel for us so we babel here first
 * before exporting...
 */

// Must require above babel-register...
// eslint-disable-next-line no-var
var preset = require(__dirname + '/../pub/babel-preset-silk-node4');

require(__dirname + '/../pub/babel-run/node')();
module.exports = require('./src');
