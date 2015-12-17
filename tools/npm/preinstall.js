#! /usr/bin/env node

/**
 * This module is a little helper which when invoked as part of an npm preinsall
 * step will symlink file:./ deps instead of copying them.
 *
 * XXX: Note: That this should not use babel features.
 */
'use strict';

let fs = require('fs');
let path = require('path');

function log(msg) {
  console.log(`[npm preinstall symlink] ${msg}`);
}

function symlinkDeps(nodeModules, dependencies) {
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

    // TODO: npm install...
  }
}

function findPackageJSON(cwd) {
  let pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    findPackageJSON(path.join(cwd, '..'));
    return;
  }

  let nodeModules = path.join(cwd, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    fs.mkdirSync(nodeModules);
  }

  let pkg = require(pkgPath);
  if (pkg.dependencies) {
    symlinkDeps(nodeModules, pkg.dependencies);
  }

  if (pkg.devDependencies) {
    symlinkDeps(nodeModules, pkg.devDependencies);
  }
}

findPackageJSON(process.cwd());
