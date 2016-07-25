/**
 * This file contains our npm init helper... This will return differing objects
 * depending on where the module is being created (pub vs not pub).
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const relativePath = path.relative(ROOT, process.cwd());

if (relativePath.indexOf('..') !== -1) {
  console.error(`Attempting to create silk package outside of silk root : ${ROOT}`);
  process.exit(1);
}

const name = `silk-${path.basename(process.cwd())}`;
const version = require('silk-core-version').semver;
const author = 'Silk Labs Inc.';
const scripts = {
  test: ''
};

function publicModule() {
  return {
    name,
    version,
    author,
    scripts,
    symlinkDependencies: {},
    dependencies: {},
    license: 'MIT'
  };
}

function privateModule() {
  return {
    name,
    version,
    author,
    scripts,
    symlinkDependencies: {},
    dependencies: {},
    private: true,
    license: 'proprietary'
  };
}

if (relativePath.indexOf('pub') === 0) {
  module.exports = publicModule();
} else {
  module.exports = privateModule();
}
