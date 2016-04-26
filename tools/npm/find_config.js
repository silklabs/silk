/**
 * Find and returns the configuration for a silk tree.
 */
'use strict';

const path = require('path');
const fs = require('fs');

const CONFIG_NAME = 'silknpm.json';

function lookup(root, file) {
  let basedir = root;
  do {
    const filePath = path.join(basedir, file);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
    basedir = path.dirname(basedir);
  } while(basedir !== '/');
  throw new Error(`Cannot find ${file} from ${root}`);
}

function formatConfig(config, basedir) {
  const result = {
    root: basedir,
    ignored: [],
    restrict: {},
  };

  result.ignored = config.ignored.map((ignore) => {
    return path.resolve(basedir, ignore);
  });

  const newRestrict = {};
  for (let key in config.restrict) {
    const restrict = config.restrict[key];
    const restrictBaseDir = path.resolve(basedir, key);

    if (!Array.isArray(restrict)) {
      console.error(`silknpm.json .restrict.${key} must be an Array`);
      continue;
    }

    result.restrict[restrictBaseDir] = restrict.map((restrictPath) => {
      return path.resolve(restrictBaseDir, restrictPath);
    });
  }

  return result;
}

function findConfig(cwd) {
  cwd = cwd || process.cwd();
  const configPath = lookup(cwd, CONFIG_NAME);
  const basedir = path.resolve(path.dirname(configPath));
  const data = require(configPath);

  data.ignored = data.ignored || [];
  data.restrict = data.restrict || {};
  return formatConfig(data, basedir);
}

module.exports = findConfig;

if (process.mainModule === module) {
  process.stdout.write(JSON.stringify(findConfig(), null, 2));
}
