'use strict';

let fs = require('fs');
let path = require('path');
let findPkgs = require('./find_packages');

const NPMRC = fs.readFileSync(path.join(__dirname, '.npmrc'), 'utf8');

for (let pkg of findPkgs()) {
  let npmrc = path.join(pkg, '.npmrc');
  if (fs.existsSync(npmrc)) {
    fs.unlinkSync(npmrc);
  }
  fs.writeFileSync(npmrc, NPMRC);
}
