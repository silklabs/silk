#! /usr/bin/env node

'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const PRESET = 'babel-preset-silk-node4';

// In our tree we have this in the immediate parent directory and use same
// preset for multiple modules (faster boot times).
const INTERNAL_PATH = path.join(ROOT, '..', PRESET);

function main() {
  if (fs.existsSync(INTERNAL_PATH)) {
    return INTERNAL_PATH;
  } else {
    return 'silk-node4';
  }
}

module.exports = main;

if (process.mainModule === module) {
  console.log(main());
}
