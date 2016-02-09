#!/usr/bin/env node

/**
 * The silk-cli (OSS) does not automatically babel for us so we babel here first
 * before exporting...
 */
require('babel-register')({
  presets: ['es2015', 'stage-0', 'react'],
  plugins: ['babel-plugin-transform-runtime'],
  only: require('silk-babeldeps'),
});

module.exports = require('./src');
