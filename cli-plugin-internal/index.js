#!/usr/bin/env node

/**
 * The silk-cli (OSS) does not automatically babel for us so we babel here first
 * before exporting...
 *
 * @noflow
 */

require(__dirname + '/../pub/babel-run/node')();
module.exports = require('./src');
