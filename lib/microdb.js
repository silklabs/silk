/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

'use strict';

const fs = require('fs');

// A simple key/value database

class DB {
  constructor(fileName) {
    this.fileName = fileName;
    this.data = Object.create(null);
    try {
      let lines = fs.readFileSync(fileName, 'utf8').split('\n');
      lines.map(line => line.split(':')).forEach(([key, value]) => key && (this.data[key] = value));
    } catch (e) { }
  }

  sync() {
    let tempName = this.fileName + '-temp';
    let out = [];
    Object.keys(this.data).sort().forEach(key => out.push(key + ':' + this.data[key]));
    fs.writeFileSync(tempName, out.join('\n'), 'utf8');
    fs.renameSync(tempName, this.fileName);
  }

  get(key) {
    return this.data[key];
  }

  put(key, value) {
    this.data[key] = value;
    this.sync();
  }

  keys() {
    return Object.keys(this.data);
  }

  size() {
    return this.keys().length;
  }

  values() {
    return this.keys().forEach(key => this.data[key]);
  }
}

module.exports = DB;
