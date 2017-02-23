'use strict';

var utils = require('lazy-cache')(require);
var fn = require;
require = utils;

/**
 * Lazily required module dependencies (globbing/fs stuff is a great
 * use case for lazy-evaluation)
 */

require('is-glob');
require('normalize-path', 'normalize');
require('resolve-dir', 'resolve');
require('micromatch', 'mm');
require = fn;

/**
 * Expose `utils`
 */

module.exports = utils;
