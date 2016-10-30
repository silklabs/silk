#! /usr/bin/env node

/* eslint-disable no-var */
/* eslint-disable flowtype/require-valid-file-annotation */

'use strict';

var path = require('path');

function main() {
  return {
    preset: path.join(__dirname, '..', 'babel-preset-silk-node4'),
    register: path.join(__dirname, '..', 'babel-run', 'node'),
  };
}

module.exports = main;

if (process.mainModule === module) {
  console.log(main()[process.argv[2]]);
}
