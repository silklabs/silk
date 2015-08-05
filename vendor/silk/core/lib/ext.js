/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let log = require('./log')('ext');
let fs = require('fs');
let path = require('path');

const extDirs = [ '/system/silk/ext', '/data/silk/ext' ];

export default function loadExtensions(extraObjects = {}) {
  log.info('Loading extensions');

  function load(file) {
    let ext = path.extname(file);
    let modulePath = ext.length > 0 ? file.slice(0, -ext.length) : file;
    try {
      log.info(`Loading ${modulePath}`);
      let env = {
        log: require('./log')(path.basename(modulePath)),
        extraObjects: extraObjects   // TODO: Remove extraObjects
      };
      require(modulePath)(env);
    } catch (e) {
      log.error(`Extension failed to load: ${modulePath}`);
      log.error(e);
    }
  }

  function loadAll(dir) {
    fs.readdir(dir, (err, list) => {
      if (err) {
        if (err.code !== 'ENOENT') {
          log.error(`Unable to read ${dir}: ${err}`);
        }
        return;
      }
      list.forEach(file => load(path.join(dir, file)));
    });
  }

  extDirs.forEach(loadAll);
}

