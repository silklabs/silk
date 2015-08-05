/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let log = require('./log')('ext');
let fs = require('fs');
let path = require('path');

const extDirs = [ '/system/silk/ext', '/data/silk/ext' ];

let extEnv = {};

function load(file) {
  let ext = path.extname(file);
  let moduleName = ext.length > 0 ? file.slice(0, -ext.length) : file;
  try {
    log.info(`Loading ${moduleName}`);
    require(moduleName)(extEnv);
  } catch (e) {
    log.error(`Extension failed to load: ${moduleName}`);
    log.error(e);
  }
}

function loadAll(dir) {
  fs.readdir(dir, (err, list) => {
    if (err) {
      log.error(`Unable to read ${dir}: ${err}`);
      return;
    }
    list.forEach(file => load(path.join(dir, file)));
  });
}

export default function loadExtensions(env = {}) {
  log.info('Loading extensions');
  extEnv = env;
  extDirs.forEach(loadAll);
}

