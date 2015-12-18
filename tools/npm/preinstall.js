#! /usr/bin/env node

/**
 * This module is a little helper which when invoked as part of an npm preinsall
 * step will symlink file:./ deps instead of copying them.
 *
 * This facilities a number of very important workflow changes such as allowing
 * editing of one module while working on another without running npm install
 * between each and every change.
 *
 * XXX: Note: That this should not use babel features.
 */
'use strict';

let fs = require('fs');
let path = require('path');
let install = require('./conditional_install');

/**
 * This is an ugly hack to break circular references up ...
 */
const PARENT = process.env.SILK_NPM_PARENT;

function log(msg) {
  console.log(`[npm preinstall symlink] ${msg}`);
}

function installDeps(cwd, nodeModules, dependencies) {
  let operations = [];

  // In some cases we must prevent the npm install step as it will result in an
  // unresolvable situation due to cylic references between packages.
  let skipInstalls = PARENT && PARENT === cwd;

  for (let pkg in dependencies) {
    let dep = dependencies[pkg];
    if (!dep.startsWith('file:')) {
      continue;
    }

    // Resolve the absolute path based on where module lives and the relative
    // path specified in the dep.
    let depPath = dep.split('file:').pop();
    // NOTE: Absolute paths for source are more reliable so we use them here.
    let pkgSource = path.resolve(nodeModules, '..', depPath);
    let pkgDest = path.join(nodeModules, pkg);

    if (fs.existsSync(pkgDest)) {
      log(`${pkgDest} already present skipping symlink...`);
    } else {
      log(`symlinking ${pkgSource} into ${pkgDest}`);

      // XXX: Symlink is sketchy so we need to use relative paths... To do this
      // in a sane way we change into the correct directory to make the relative
      // symlink and then back.
      let oldCWD = process.cwd();
      process.chdir(nodeModules)
      fs.symlinkSync(pkgSource, pkg);
      process.chdir(oldCWD);
    }

    if (!skipInstalls) {
      operations.push(install(cwd, pkgSource));
    }
  }

  return Promise.all(operations);
}

function findPackageJSON(cwd) {
  let pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return findPackageJSON(path.join(cwd, '..'));
  }

  let nodeModules = path.join(cwd, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    fs.mkdirSync(nodeModules);
  }

  let pkg = require(pkgPath);
  let operations = [];
  if (pkg.dependencies) {
    operations.push(installDeps(cwd, nodeModules, pkg.dependencies));
  }

  if (pkg.devDependencies) {
    operations.push(installDeps(cwd, nodeModules, pkg.devDependencies));
  }

  return Promise.all(operations)
}

findPackageJSON(process.cwd()).catch((err) => {
  log(`Preinstall has failed ${err.stack || err}`);
  process.exit(1);
});
