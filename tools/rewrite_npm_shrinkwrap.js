#!/usr/bin/env node
/**
 * Generate a npm_shrinkwrap.json that pegs crypto-browserify as an
 * eventual dependency of webpack to a newer version.
 *
 * See https://github.com/webpack/webpack/issues/1568.
 */

const child_process = require('child_process');
const fs = require('fs');

// Blow away existing state.
child_process.execSync('rm -rf npm-shrinkwrap.json');
child_process.execSync('rm -rf node_modules/webpack');
child_process.execSync('rm -rf node_modules/crypto-browserify');

// Re-install webpack and the desired version of crypto-browserify
child_process.execSync('npm install');
child_process.execSync('npm install --save-dev crypto-browserify@^3.10.0');
child_process.execSync('npm shrinkwrap --dev');

// Rewrite npm-shrinkwrap.json
var ns = JSON.parse(fs.readFileSync('npm-shrinkwrap.json'));
ns.dependencies['webpack']
  .dependencies['node-libs-browser']
  .dependencies['crypto-browserify']
  = ns.dependencies['crypto-browserify'];
delete ns.dependencies['crypto-browserify'];

fs.writeFileSync('npm-shrinkwrap.json', JSON.stringify(ns, null, 2));
child_process.execSync('npm uninstall --save-dev crypto-browserify');
child_process.execSync('rm -rf node_modules/webpack');
child_process.execSync('npm install');
