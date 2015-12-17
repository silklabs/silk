'use strict';

process.env.SILK_TEST = 'unit';

// Babel 5.x ignores .babelrc for the babel/register compiler, which
// is what we use for mocha (see mocha.opts).
// See also https://github.com/babel/babel/issues/1004
let fs = require('fs');
let path = require('path');
let babelrc = fs.readFileSync(path.resolve(__dirname, '..', '.babelrc'));


require('babel/register')(
  Object.assign(JSON.parse(babelrc), {
    only: require('babelfilter')
  })
);
