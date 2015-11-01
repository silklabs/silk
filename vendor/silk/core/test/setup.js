process.env.SILK_TEST = 'unit';

// Babel 5.x ignores .babelrc for the babel/register compiler, which
// is what we use for mocha (see mocha.opts).
// See also https://github.com/babel/babel/issues/1004
var fs = require('fs');
var path = require('path');
require('babel/register')(
  JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '..', '.babelrc')
    )
  )
);
