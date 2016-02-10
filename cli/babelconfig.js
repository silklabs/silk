#! /usr/bin/env node

'use strict';

var path = require('path');
var fs = require('fs');

var ROOT = __dirname;
var PRESET = 'babel-preset-silk-node4';
var REGISTER = 'babel/register';

function main() {
  var preset = path.join(ROOT, '..', PRESET);
  var register = path.join(ROOT, '..', REGISTER);
  return {
    preset: preset || 'silk-node4',
    register: register || 'babel-register',
  };
}

module.exports = main;

if (process.mainModule === module) {
  console.log(main()[process.argv[2]]);
}
