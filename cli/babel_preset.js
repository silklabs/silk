#! /usr/bin/env node

'use strict';

var path = require('path');
var fs = require('fs');

var ROOT = __dirname;
var PRESET = 'babel-preset-silk-node4';

var ROOT_DIR = path.join(ROOT, '..', PRESET);

function main() {
  if (fs.existsSync(ROOT_DIR)) {
    return ROOT_DIR;
  } else {
    return 'silk-node4';
  }
}

module.exports = main;

if (process.mainModule === module) {
  console.log(main());
}
