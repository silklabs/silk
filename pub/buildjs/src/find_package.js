'use strict';

const path = require('path');
const fs = require('fs');

function findPackageRoot(curPath) {
  curPath = curPath || process.cwd();
  let curName = path.join(curPath, 'package.json');

  while (!fs.existsSync(curName)) {
    if (curPath === '/') {
      throw new Error(`Could not locate 'package.json' file. Ensure you're running this command inside a Silk extension project.`);
    }
    curPath = path.dirname(curPath);
    curName = path.join(curPath, 'package.json');
  }

  return curPath;
}

module.exports = findPackageRoot;
