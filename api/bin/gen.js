#! /usr/bin/env node

'use strict';

let fs = require('fs');
let path = require('path');

let cache = {};

require('babel/register')({
  stage: 0,
  only: require('silk-babeldeps')
});

require('../src/_generate')();
