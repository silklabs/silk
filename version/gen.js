'use strict';

const fs = require('fs');
const path = require('path');

module.exports = function generate(overrides) {
  const branchPath = path.join(__dirname, 'branch');
  const branchContent = fs.readFileSync(branchPath, 'utf8').trim();
  const branch = branchContent.match(/BRANCH=(.*)/)[1];
  const buildtime = Date.now();
  const semver = require('./package.json').version;
  let bsp_api_id = '';
  try {
    bsp_api_id = require('silk-bsp-version').bsp_api_id;
  } catch (e) {
    // ignore
  };

  const version = Object.assign({
    branch,
    bsp_api_id,
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
