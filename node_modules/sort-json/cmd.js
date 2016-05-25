#!/usr/bin/env node

var fs = require('fs');
var path = require('path');

var filename = path.resolve(process.argv[2]);
var json = JSON.parse(fs.readFileSync(filename));

var visit = require('./');

var result = visit(json);

fs.writeFile(filename, JSON.stringify(result, null, '  '));