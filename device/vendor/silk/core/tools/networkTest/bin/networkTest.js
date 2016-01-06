#! /usr/bin/env node

'use strict';

require('babel/register-without-polyfill')({
  stage: 0,
  only: require('babelfilter')
});

require('../lib/main');
