/**
 * require() helper to run particular module under babel-preset-silk-node6.
 */

'use strict';

const path = require('path');
const fs = require('fs');


// Search for the special babeldeps package if present ...
const BABEL_DEP_PATHS = [
  path.join(__dirname, '../'),
  path.join(__dirname, '../../'),
];

// Resolve our special babeldeps package if it can be found.
let babeldeps = null;
for (let dep of BABEL_DEP_PATHS) {
  const depPath = path.join(dep, 'babeldeps', 'package.json');
  if (fs.existsSync(depPath)) {
    const requirePath = path.join(dep, 'babeldeps');
    babeldeps = require(requirePath);
  }
}


const DEFAULT_OPTIONS = {
  presets: [
    require('babel-preset-silk-node6'),
  ],
  only: babeldeps
};

module.exports = (options) => {
  options = options || {};
  require('./babel-register')(Object.assign({}, DEFAULT_OPTIONS, options));
};
