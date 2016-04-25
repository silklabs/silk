#! /usr/bin/env node

'use strict';

var path = require('path');
var fs = require('fs');

function main() {
  return {
    preset: path.join(__dirname, '..', 'babel-preset-silk-node4'),
    register: path.join(__dirname, '..', 'babel', 'register'),
  };
}

module.exports = main;

if (process.mainModule === module) {
  console.log(main()[process.argv[2]]);
}
