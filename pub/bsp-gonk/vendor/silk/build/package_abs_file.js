#!/usr/bin/env node
'use strict'

const fs = require('fs');
const path = require('path');

function usage(msg) {
  if (msg) {
    console.error(`\n** Error: ${msg}\n`);
  }
  console.log('Usage: ' + process.argv[1] + ' relocated/package.json original/directory/');
  console.log();
  console.log('Rewrites any relative file: package versions in the provided package.json');
  console.log('to absolute paths');
  console.log();
  process.exit(1);
}

let packageFile;
let originalLocation;

switch (process.argv.length) {
case 4:
  packageFile = process.argv[2];
  originalLocation = process.argv[3];
  break;
default:
  usage('Invalid command-line arguments');
}

if (!fs.statSync(packageFile).isFile()) {
  usage(`${packageFile} is not a file`);
}
if (!fs.statSync(originalLocation).isDirectory()) {
  usage(`${originalLocation} is not a directory`);
}

function rewriteFileVersions(dependencies) {
  if (!dependencies) return;

  const packageNames = Object.keys(dependencies);
  packageNames.forEach(function(name) {
    const version = dependencies[name];
    if (version.substr(0, 5) === 'file:') {
      const filepath = version.substring(5);
      if (!path.isAbsolute(filepath)) {
        dependencies[name] = 'file:' + path.resolve(originalLocation, filepath);
      }
    }
  });
}

var packageObject = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
rewriteFileVersions(packageObject.dependencies);
rewriteFileVersions(packageObject.devDependencies);
fs.writeFileSync(packageFile, JSON.stringify(packageObject, null, ' '), 'utf8');
