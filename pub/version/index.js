'use strict';

const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, 'dist/index.json');

if (fs.existsSync(dist)) {
  module.exports = require(dist);
} else {
  const branchPath = path.join(__dirname, 'branch');
  const branchContent = fs.readFileSync(branchPath, 'utf8').trim();
  const branch = branchContent.match(/BRANCH=(.*)/)[1];

  let bsp_api_id = '';
  try {
    bsp_api_id = require('silk-bsp-version').bsp_api_id;
  } catch (e) {};

  module.exports = {
    branch,
    bsp_api_id,
    buildtime: Date.now(),
    official: false,
    semver: require('./package.json').version,
    sha: ''
  };
}
