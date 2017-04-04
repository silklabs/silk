#! /usr/bin/env node

/**
 * This module is helper to find all package.json files which are present in the
 * tree that do not fall under a node_modules folder.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_NAME = 'silknpm.json';

// Will not traverse any directories matching these names...
const RESTRICTED_DIRNAMES = [
  'node_modules',
];

function lookup(root, file) {
  let basedir = root;
  do {
    const filePath = path.join(basedir, file);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
    basedir = path.dirname(basedir);
  } while(basedir !== '/');
  throw new Error(`Cannot find ${file} from ${root}`);
}

function formatConfig(config, basedir) {
  const result = {
    root: basedir,
    restrict: {},
  };

  const newRestrict = {};
  for (let key in config.restrict) {
    const restrict = config.restrict[key];
    const restrictBaseDir = path.resolve(basedir, key);

    if (!Array.isArray(restrict)) {
      console.error(`silknpm.json .restrict.${key} must be an Array`);
      continue;
    }

    result.restrict[restrictBaseDir] = restrict.map((restrictPath) => {
      return path.resolve(restrictBaseDir, restrictPath);
    });
  }

  return result;
}

function findConfig(cwd) {
  cwd = cwd || process.cwd();
  const configPath = lookup(cwd, CONFIG_NAME);
  const basedir = path.resolve(path.dirname(configPath));
  const data = require(configPath);

  data.restrict = data.restrict || {};
  return formatConfig(data, basedir);
}

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
  const config = findConfig();
  rootPath = rootPath || config.root;
  result = result || [];

  fs.readdirSync(rootPath).forEach((found) => {
    const absPath = path.join(rootPath, found);
    // Some directories should not be searched entirely due to lack of
    // interesting content...
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
