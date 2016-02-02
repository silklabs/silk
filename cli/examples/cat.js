'use strict';

const fs = require('fs');

module.exports.cat = {
  help: `You need catz`,
  arguments: [],
  main: (args) => {
    process.stdout.write(fs.readFileSync(__dirname + '/cat.txt', 'ascii'));
  },
};
