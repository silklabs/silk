/**
 * This module uses various tricks to try to reduce the number of times relative
 * packages need to be re-installed.
 *
 * It does this by constructing a hash of the following information and stuffing
 * it into `node_modules`
 *
 *  - the sha1 of the package
 *  - hash of the package.json of the package
 *
 * The intention being only to run npm install during obvious changes.
 */

'use strict';

let spawn = require('child_process').spawn;
let execSync = require('child_process').execSync;
let crypto = require('crypto');
let path = require('path');
let fs = require('fs');

const HASH_FILE = '.silk_npm_hash';

function log(msg) {
  console.log(`[npm conditional install] ${msg}`);
}

/**
 * Spawn a sub process and log it's output.
 */
function run(opts, cli, argv, cb) {
  opts = Object.assign({}, opts, {
    stdio: 'inherit',
  });

  let proc = spawn(cli, argv, opts);
  proc.once('exit', cb);
  return proc;
}

/**
 * Construct the hash used to detect when to run npm install.
 */
function constructHash(installModulePath) {
  let gitsha = execSync(`git rev-list HEAD -n1 ${installModulePath}`);
  let pkgContent = fs.readFileSync(path.join(installModulePath, 'package.json'));

  return crypto.createHash('sha256').update(Buffer.concat([
    gitsha,
    pkgContent
  ])).digest('hex');
}

class ConditionalInstall {
  constructor() {
    this._process = null;
  }

  cancel() {
    return new Promise((accept) => {
      if (!this._process) {
        accept();
        return;
      }
      this._process.on('exit', accept);
      this._process = null;
    });
  }

  _install(parent, installModulePath, nodeModules, hashFile, hash) {
    let opts = {
      /**
       * Allows us to break cylic references by telling sub installs why the npm
       * install was triggered.
       */
      env: Object.assign({}, process.env),
      cwd: installModulePath
    };

    return new Promise((accept, reject) => {
      run(opts, '/bin/bash', [
        '-c',
        `npm install`
      ], (code) => {
        if (code !== 0) {
          let msg = `failed to install ${installModulePath}`;
          log(msg);
          reject(new Error(msg));
          return;
        }

        // Only store a hash if the node modules folder has content.
        let hasModules = fs.readdirSync(nodeModules).some((path) => {
          return path.indexOf('.') === -1;
        });

        if (!hasModules) {
          log(`${installModulePath} has no node_modules folder after successful install skipping hash.`);
          accept();
          return;
        }

        log(`writing hash for ${installModulePath}`);
        fs.writeFileSync(hashFile, hash);
        accept();
      });
    });
  }

  run(installingFor, installModulePath) {
    let nodeModules = path.join(installModulePath, 'node_modules');
    let hashFile = path.join(nodeModules, HASH_FILE);

    let hasModules = fs.existsSync(nodeModules);
    let hasHash = fs.existsSync(hashFile);
    let hash = constructHash(installModulePath);

    if (
      hasModules &&
      hasHash &&
      hash === fs.readFileSync(hashFile, 'utf8')
    ) {
      log(`Hash matches in ${installModulePath} skipping...`);
      return Promise.resolve();
    }

    log(`Installing ${installModulePath}`);
    return this._install(
      installingFor,
      installModulePath,
      nodeModules,
      hashFile,
      hash
    );
  }
}

module.exports = ConditionalInstall;
