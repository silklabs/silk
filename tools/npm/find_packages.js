#! /usr/bin/env node

/**
 * This module is helper to find all package.json files which are present in the
 * tree that do not fall under a node_modules folder.
 */

'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '../..');
var DEVICE = path.join(ROOT, 'device');

// Will not traverse any directories matching these names...
const RESTRICTED_DIRNAMES = [
  'node_modules',
  'local_node_modules'
];

// Provisional searching only will search the listed portions of these directories.
const RESTRICTED = {
  [DEVICE]: [
    `${DEVICE}/vendor`
  ],
  [`${DEVICE}/vendor`]: [
    `${DEVICE}/vendor/silk`
  ]
};

function resolvePath(absPath, result) {
  let stat;
  try {
    stat = fs.lstatSync(absPath);
  } catch (err) {
    return;
  }

  if (stat.isSymbolicLink()) {
    return;
  }

  let basename = path.basename(absPath);

  if (basename[0] === '.') {
    return;
  }

  if (RESTRICTED_DIRNAMES.indexOf(basename) !== -1) {
    return;
  }

  if (basename === 'package.json') {
    result.push(path.dirname(absPath));
    return;
  }

  if (stat.isDirectory()) {
    return findModules(absPath, result);
  }
}

function findModules(rootPath, result) {
  rootPath = rootPath || ROOT;
  result = result || [];

  let list = fs.readdirSync(rootPath).map((found) => path.join(rootPath, found));
  list.forEach((absPath) => {
    // Some directories should not be searched entirely due to lack of interesting
    // content...
    let restricted = RESTRICTED[rootPath];
    if (restricted && restricted.indexOf(absPath) === -1) {
      return;
    }

    resolvePath(absPath, result);
  });

  return result;
}


if (process.mainModule === module) {
  let paths = findModules();
  process.stdout.write(paths.join('\n'));
}

module.exports = findModules;
