/**
 * Require helper to run particular module under babel6 + node4 preset.
 */

'use strict';

const path = require('path');

const DEFAULT_OPTIONS = {
  presets: [
    require(path.join(__dirname, '..', 'pub', 'babel-preset-silk-node4'))
  ],
  only: require(path.join(__dirname, '..', 'babeldeps')),
};

const REGISTER_PATH = path.join(__dirname, '..', 'pub', 'babel', 'register');

module.exports = (options) => {
  options = options || {};
  require(REGISTER_PATH)(Object.assign({}, DEFAULT_OPTIONS, options));
};
