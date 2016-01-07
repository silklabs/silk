'use strict';

process.env.SILK_TEST = 'unit';

// Babel 5.x ignores .babelrc for the babel/register compiler, which
// is what we use for mocha (see mocha.opts).
// See also https://github.com/babel/babel/issues/1004
require('babel/register')({
  stage: 0,
  only: require('silk-babeldeps')
});
