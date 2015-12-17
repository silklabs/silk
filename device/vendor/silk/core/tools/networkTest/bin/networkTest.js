#! /usr/bin/env node

'use strict';

require('babel-core/register')({
  stage: 0,
  only: require('babelfilter')
});

require('../lib/main');
