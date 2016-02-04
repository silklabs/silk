'use strict';

var fs = require('fs');

module.exports.cat = {
  help: 'You need catz',
  arguments: [],
  main: function (args) {
    process.stdout.write(fs.readFileSync(__dirname + '/cat.txt', 'ascii'));
  },
};
