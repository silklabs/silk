#! /usr/bin/env node

'use strict';

let fs = require('fs');
let path = require('path');

let cache = {};

require('babel/register')({
  stage: 0,
  optional: ['asyncToGenerator'],
  blacklist: ['runtime'],
  // Ignore everything in node_modules except node_modules/rcomponents.
  ignore: /node_modules\/(?!silk-server)/,
  only: require('babelfilter')
});

require('../src/_generate')();
