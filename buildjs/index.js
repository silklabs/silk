// @noflow
'use strict';

const path = require('path');
const fs = require('fs');

function getPackageMain(pkgMain, modulePath) {
  let main = pkgMain || './index.js';
  if (!path.extname(main)) {
    const absMain = path.resolve(modulePath, main);

    if (fs.existsSync(`${absMain}.js`)) {
      // Check if main is a javascript file
      main += '.js';
    } else if (fs.existsSync(path.join(absMain, 'index.js'))) {
      // Check if main is a directory that an has an index.js
      main = path.join(main, 'index.js');
    }
  }

  if (main.indexOf('./') !== 0) {
    main = `./${main}`;
  }

  return main;
}

module.exports = {getPackageMain};
