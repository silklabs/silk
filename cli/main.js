#! /usr/bin/env node

/**
 * Bootstrap the CLI note that this might be run with babel-node OR inside a
 * production environment with babel assets compiled so we detect this and run
 * the appropriate steps.
 */

var fs = require('fs');
var path = require('path');

// XXX: This might fail in npm3 situations where cli is somehow embedded into
// your project without being built which should never happen.
var REGISTER_PATH = path.join(__dirname, 'node_modules', 'babel-register');

if (fs.existsSync(REGISTER_PATH)) {
  require('babel-register')();
  require('./src');
} else {
  require('./build');
}

