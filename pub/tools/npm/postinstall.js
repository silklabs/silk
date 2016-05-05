#! /usr/bin/env node

/**
 * This module is a little helper which when invoked as part of an npm postinsall
 * step will symlink file:./ deps instead of copying them.
 *
 * This facilities a number of very important workflow changes such as allowing
 * editing of one module while working on another without running npm install
 * between each and every change.
 *
 * XXX: Note: That this should not use babel features.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const config = require('./find_config')();
const ConditionalInstall = require('./conditional_install');

/**
 * This is an ugly hack to break circular references up ...
 */
const CORE = config.root;
const LOCK_FILE = 'node_modules/.__silk_npm_lock';
const LOCK_POLL_MS = 500;
const NPM_CONFIG = path.join(__dirname, '.npmrc');

// Yet another nasty hack to ensure we don't run dependant install for these
// modules...
const NEVER_RUN_NPM_INSTALL = new Set(config.ignored);

let currentModule;
let selfLock;
let pendingLocks = [];
let createdLocks = [];
let runningInstalls = new Set();

function unlink(path) {
  if (!fs.existsSync(path)) {
    return;
  }
  fs.unlinkSync(path);
}

function destroyUnownedLocks() {
  // Ensure the lock we created is destroyed...
  unlink(selfLock);
  // Any any locks we opened...
  createdLocks.forEach((lock) => unlink(lock));
};

function log(msg) {
  console.log(`[npm postinstall] ${msg}`);
}

function debug(msg) {
  if (process.env.V === '1') {
    log(msg);
  }
}

function parseLockFile(content) {
  return content.split('\n').reduce((result, value) => {
    let type = value[0];
    let lockPath = value.slice(2);

    switch(type) {
    case '+':
      result.add(lockPath);
      break;
    case '-':
      result.delete(lockPath);
      break;
    default:
      throw new Error('Unknown lock type in:' + content);
    }

    return result;
  }, new Set());
}

/**
 * Wait for the lock file to be released.
 */
function waitForLocks(lock) {
  if (pendingLocks.length === 0) {
    return Promise.resolve();
  }

  return new Promise((accept) => {
    let poll = () => {
      let remaining = new Set();
      let emptyLocks = false;

      for (let lockFile of pendingLocks) {
        if (!fs.existsSync(lockFile)) {
          continue;
        }

        let content = fs.readFileSync(lockFile, 'utf8').trim();
        if (!content) {
          emptyLocks = true;
          continue;
        }

        let parsed = parseLockFile(content);
        remaining = new Set(Array.from(remaining).concat(Array.from(parsed)))
      }

      let remainderArray = Array.from(remaining.values());

      if (!emptyLocks && remainderArray.length === 0) {
        accept();
        return;
      }

      /**
       * Our dependencies are not yet finished but only because they are waiting
       * for us to finish (cyclic dependency).
       */
      if (
        remainderArray.length === 1 &&
        remainderArray[0] === currentModule
      )  {
        accept();
        return;
      }

      setTimeout(poll, LOCK_POLL_MS);
    };
    poll();
  });
}

/**
 * symlinkDependencies when given an absolute path are relative to the root of silk
 * core otherwise relative to their package root.
 */
function depPathToAbsolute(nodeModules, dependencyPath) {
  if (dependencyPath[0] === '/') {
    return path.join(CORE, dependencyPath);
  }

  // Resolve to absolute path.
  return path.resolve(nodeModules, '..', dependencyPath);
}

function installDeps(cwd, nodeModules, dependencies) {
  let operations = [];

  for (let pkg in dependencies) {
    let dep = dependencies[pkg];

    // Resolve the absolute path based on where module lives and the relative
    // path specified in the dep.
    let pkgSource = depPathToAbsolute(nodeModules, dep);
    let pkgDest = path.join(nodeModules, pkg);

    try {
      let stat = fs.lstatSync(pkgDest);
      if (stat.isSymbolicLink()) {
        fs.unlinkSync(pkgDest);
      }
    } catch (err) {
      // Just ensure we don't fall over...
    }

    if (fs.existsSync(pkgDest)) {
      debug(`${pkgDest} already present skipping symlink...`);
    } else {
      debug(`symlinking ${pkgSource} into ${pkgDest}`);

      // XXX: Symlink is sketchy so we need to use relative paths... To do this
      // in a sane way we change into the correct directory to make the relative
      // symlink and then back.
      let oldCWD = process.cwd();
      process.chdir(nodeModules)
      fs.symlinkSync(path.relative(nodeModules, pkgSource), pkg);
      process.chdir(oldCWD);

      // Symlink package binaries into node_modules/.bin/
      let packageJson = JSON.parse(fs.readFileSync(path.join(pkgSource, 'package.json'), 'utf8'));
      if (packageJson.bin) {
        let nodeModulesBin = path.join(nodeModules, '.bin');
        if (!fs.existsSync(nodeModulesBin)) {
          fs.mkdirSync(nodeModulesBin);
        }

        for (let binName in packageJson.bin) {
          let binTarget = path.join('..', pkg, packageJson.bin[binName]);
          debug(`${nodeModulesBin}/${binName} => ${binTarget}`);

          let oldCWD = process.cwd();
          process.chdir(nodeModulesBin);
          if (fs.existsSync(binName)) {
            fs.unlinkSync(binName);
          }
          try {
            fs.symlinkSync(binTarget, path.join(nodeModulesBin, binName));
          } catch (err) {
            if (err.code !== 'EEXIST') {
              throw err;
            }
          }
          process.chdir(oldCWD);
        }
      }
    }

    if (NEVER_RUN_NPM_INSTALL.has(pkgSource)) {
      continue;
    }

    let pkgNodeModules = path.join(pkgSource, 'node_modules');
    if (!fs.existsSync(pkgNodeModules)) {
      fs.mkdirSync(pkgNodeModules);
    }

    let lock = path.join(pkgSource, LOCK_FILE);
    if (!fs.existsSync(lock)) {
      fs.appendFileSync(lock, '');
      createdLocks.push(lock);

      let installer = new ConditionalInstall();
      runningInstalls.add(installer);

      // Update the self lock.
      fs.appendFileSync(selfLock, `+ ${pkgSource}\n`);
      let finish = () => {
        runningInstalls.delete(installer);
        fs.appendFileSync(selfLock, `- ${pkgSource}\n`);

        // Simple dependencies may not actually write to their lock file. If
        // it's empty delete it so we don't get held up.
        if (fs.existsSync(lock)) {
          debug(`Removing simple or stale lock ${lock}`);
          fs.unlinkSync(lock);
        }
      }


      operations.push(installer.run(cwd, pkgSource).
        then(finish).
        catch((err) => {
          finish();
          throw err;
        }));

    } else {
      if (createdLocks.indexOf(lock) === -1) {
        // Wait for install in another process...
        log(`Waiting for dependency ${pkgSource}`);
        pendingLocks.push(lock);
      }
    }
  }

  return Promise.all(operations);
}

function findPackageJSON(cwd) {
  let pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return findPackageJSON(path.join(cwd, '..'));
  }

  currentModule = cwd;

  let nodeModules = path.join(cwd, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    fs.mkdirSync(nodeModules);
  }

  // We might create cyclic references with our symlinks ensure that Android
  // build system never looks in our node_modules folders by adding an empty
  // Android.mk.
  let androidMk = path.join(nodeModules, 'Android.mk');
  if (!fs.existsSync(androidMk)) {
    fs.writeFileSync(androidMk, '');
  }

  // Initiate the lock!
  selfLock = path.join(cwd, LOCK_FILE);
  if (!fs.existsSync(selfLock)) {
    // Atomically create a file.
    fs.appendFileSync(selfLock, '');
  }

  let pkg = require(pkgPath);
  if (!pkg.symlinkDependencies) {
    return Promise.resolve();
  }

  return installDeps(cwd, nodeModules, pkg.symlinkDependencies).then(() => {
    try {
      fs.unlinkSync(selfLock);
    } catch (err) {}
    return waitForLocks();
  });
}

let start = Date.now();
findPackageJSON(process.cwd()).then(() => {
  let corePath = path.resolve(process.cwd()).replace(CORE, '');
  let duration = Date.now() - start;
}).catch((err) => {
  log(`Preinstall has failed ${err.stack || err}`);
  destroyUnownedLocks();
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  destroyUnownedLocks();
  console.error(err.stack);
  process.exit(1);
})

process.on('SIGINT', () => {
  destroyUnownedLocks();
  Promise.all(Array.from(runningInstalls).map((installer) => {
    return installer.cancel();
  })).then(() => {
    process.exit(1);
  });
});
process.on('exit', destroyUnownedLocks);
