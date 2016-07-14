#! /usr/bin/env node

'use strict';

var path = require('path');

function main() {
  return {
    preset: path.join(__dirname, '..', 'babel-preset-silk-node4'),
    register: path.join(__dirname, '..', 'babel-run/node'),
  };
}

module.exports = main;

if (process.mainModule === module) {
  console.log(main()[process.argv[2]]);
}
