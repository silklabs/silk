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

  module.exports = {
    branch,
    buildtime: Date.now(),
    official: false,
    semver: require('./package.json').version,
    sha: ''
  };
}
