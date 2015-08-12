/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let log = require('./log')('ext');
let fs = require('mz/fs');
let path = require('path');
let events = require('events');

const extDirs = [ '/system/silk/ext', '/data/silk/ext' ];

class Env extends events.EventEmitter {

  constructor(name) {
    super();
    this._name = name;
  }

  get log() {
    if (!this._log) {
      this._log = require('./log')(this._name);
    }
    return this._log;
  }
}


class Extensions {

  constructor(extraObjects = {}) {
    this.loaded = [];
    this.extraObjects = extraObjects;

    extDirs.forEach(dir => {
      fs.readdir(dir)
      .catch(err => {
        if (err && err.code === 'ENOENT') {
          return;
        }
        log.error(`Unable to read ${dir}: ${err}`);
      })
      .then(files => files.forEach(file => this._loadExtension(path.join(dir, file))));
    });
  }

  _loadExtension(file) {
    let ext = path.extname(file);
    let modulePath = ext.length > 0 ? file.slice(0, -ext.length) : file;
    try {
      log.info(`Loading ${modulePath}`);
      let env = new Env(path.basename(modulePath));
      env.extraObjects = this.extraObjects;  // TODO: Remove extraObjects
      this.loaded.push({ env: env, mod: require(modulePath)(env)});
    } catch (e) {
      log.error(`Extension failed to load: ${modulePath}`);
      log.error(e);
    }
  }
}

export default function makeExtensions(extraObjects = {}) {
  return new Extensions(extraObjects);
}
