'use strict';

const fs = require('fs');
const path = require('path');

module.exports = function generate(overrides) {
  const branchPath = path.join(__dirname, 'branch');
  const branchContent = fs.readFileSync(branchPath, 'utf8').trim();
  const branch = branchContent.match(/BRANCH=(.*)/)[1];
  const buildtime = Date.now();
  const semver = require('./package.json').version;

  const version = Object.assign({
    branch,
    buildtime,
    official: false,
    semver,
    sha: '',
  }, overrides);

  let string = version.branch + ' ' + version.semver;
  if (version.sha) {
    string += ' ' + version.sha.slice(0, 7);
  }
  string += ' ' + new Date(version.buildtime).toISOString();
  if (!version.official) {
    string += ' (unofficial)';
  }
  version.string = string;
  return Object.freeze(version);
};
