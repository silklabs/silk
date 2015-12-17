/**
 * Minimal helper to detect which modules need to be babelified within silk-core.
 */

'use strict';

let fs = require('fs');
let path = require('path')
let pkgFinder = require('../tools/npm/find_packages');

const PACKAGE_ROOTS = pkgFinder();

// Blacklisted modules which for whatever reason do not need/want to be
// babelified
[
  // Root module should always be ignored otherwise we end up including
  // everything anyhow.
  path.join(__dirname, '..'),

  // Created when babel was harder to use and makes supporting app harder since
  // it requires relative plugins for in tree stuff (yay babel6).
  path.join(__dirname, '..', 'raygun'),
  path.join(__dirname, '..', 'log'),
].forEach((path) => {
  let idx = PACKAGE_ROOTS.indexOf(path);
  if (idx !== -1) {
    PACKAGE_ROOTS.splice(idx, 1);
  }
});

let cache = {};
function main(fileName) {
  /**
   * This is the real magic here since we symlink all our local node_module
   * folders it makes it very easy to detect which are our modules and which are
   * pull from elsewhere...
   */
  fileName = fs.realpathSync(fileName, cache);

  if (fileName.indexOf('node_modules') !== -1) {
    return false;
  }

  let result = PACKAGE_ROOTS.some((pkgRoot) => fileName.startsWith(pkgRoot));
  if (process.env.DEBUG && result) {
    console.log('babelify:', fileName);
  }

  return result;
}

if (process.mainModule === module) {
  console.log(main(process.argv[2]));
}

module.exports = main;
