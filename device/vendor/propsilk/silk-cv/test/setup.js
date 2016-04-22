'use strict';
require('babel/register')({
  stage: '1',
  optional: ['regenerator', 'asyncToGenerator', 'es7.classProperties'],
  only: require('silk-babeldeps'),
});
