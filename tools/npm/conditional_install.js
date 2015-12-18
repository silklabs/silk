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
function run(title, opts, cli, argv, cb) {
  opts = Object.assign({}, opts, {
    stdio: 'pipe',
  });

  let proc = spawn(cli, argv, opts);

  proc.stdout.on('data', (buffer) => {
    process.stdout.write(`[${title}] ${buffer.toString()}`);
  });

  proc.stderr.on('data', (buffer) => {
    process.stderr.write(`[${title} err!] ${buffer.toString()}`);
  });

  proc.once('exit', cb);
}

/**
 * Construct the hash used to detect when to run npm install.
 */
function constructHash(directory) {
  let gitsha = execSync(`git rev-list HEAD -n1 ${directory}`);
  let pkgContent = fs.readFileSync(path.join(directory, 'package.json'));

  return crypto.createHash('sha256').update(Buffer.concat([
    gitsha,
    pkgContent
  ])).digest('hex');
}

function install(parent, directory, nodeModules, hashFile, hash) {

  let title = `npm install ${directory}`;
  let opts = {
    /**
     * Allows us to break cylic references by telling sub installs why the npm
     * install was triggered.
     */
    env: Object.assign({}, process.env, { SILK_NPM_PARENT: directory }),
    cwd: directory
  };

  return new Promise((accept, reject) => {
    run(title, opts, '/bin/bash', [
      '-c',
      `npm install`
    ], (code) => {
      if (code !== 0) {
        let msg = `failed to install ${directory}`;
        log(msg);
        reject(new Error(msg));
        return;
      }

      // If the module has no dependencies it will not have a node_modules folder
      // detect this and bypass writing the hash...
      if (!fs.existsSync(nodeModules)) {
        log(`${directory} has no node_modules folder after successful install skipping hash.`);
        accept();
        return;
      }

      log(`writing hash for ${directory}`);
      fs.writeFileSync(hashFile, hash);
      accept();
    });
  });
}

/**
 * Run npm install in the given directory if needed.
 */
function conditionallyInstall(installingFor, directory) {
  let nodeModules = path.join(directory, 'node_modules');
  let hashFile = path.join(nodeModules, HASH_FILE);

  let hasModules = fs.existsSync(nodeModules);
  let hasHash = fs.existsSync(hashFile);
  let hash = constructHash(directory);

  if (
    hasModules &&
    hasHash &&
    hash === fs.readFileSync(hashFile, 'utf8')
  ) {
    log(`Hash matches in ${directory} skipping...`);
    return Promise.resolve();
  }

  log(`Installing ${directory}`);
  return install(installingFor, directory, nodeModules, hashFile, hash);
}

module.exports = conditionallyInstall;
