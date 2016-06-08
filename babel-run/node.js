/**
 * Require helper to run particular module under babel6 + node4 preset.
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
    require('babel-preset-silk-node4'),
  ],
  only: babeldeps
};

const REGISTER_PATH = path.join(__dirname, 'babel-register', 'register');

module.exports = (options) => {
  options = options || {};
  require(REGISTER_PATH)(Object.assign({}, DEFAULT_OPTIONS, options));
};
