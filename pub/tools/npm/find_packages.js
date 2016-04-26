#! /usr/bin/env node

/**
 * This module is helper to find all package.json files which are present in the
 * tree that do not fall under a node_modules folder.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./find_config')();

// Will not traverse any directories matching these names...
const RESTRICTED_DIRNAMES = [
  'node_modules',
  'local_node_modules'
];

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
  rootPath = rootPath || config.root;
  result = result || [];

  let list = fs.readdirSync(rootPath).map((found) => path.join(rootPath, found));
  list.forEach((absPath) => {
    // Some directories should not be searched entirely due to lack of interesting
    // content...
    let restricted = config.restrict[rootPath];
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
