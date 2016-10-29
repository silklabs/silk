#! /usr/bin/env node

'use strict';

var path = require('path');
var fs = require('fs');

function main() {
  return {
    preset: path.join(__dirname, '..', 'babel-preset-silk-node6'),
    register: path.join(__dirname, '..', 'babel-run/node'),
  };
}

module.exports = main;

if (process.mainModule === module) {
  console.log(main()[process.argv[2]]);
}
