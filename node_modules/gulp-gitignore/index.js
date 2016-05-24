'use strict';
var filter = require('gulp-filter');
var gitignore = require('parse-gitignore');
var fs = require('fs');
var startsWith = require('starts-with');

module.exports = function (fp, patterns, options) {
  if (!fp) {
    fp = '.gitignore';
  }

  if (!fs.existsSync(fp)) {
    return [];
  }

  if (typeof patterns !== 'string' && !Array.isArray(patterns)) {
    options = patterns;
    patterns = [];
  }

  var glob = gitignore(fp, patterns);
  var inverted = glob.map(function (pattern) {
    return startsWith(pattern, '!') ? pattern.slice(1) : '!' + pattern;
  });
  inverted.unshift('**/*');

  return filter(inverted, options || {});
};
