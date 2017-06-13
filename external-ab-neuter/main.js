'use strict';

const ab_neuter = require('./build/Release/ab_neuter');

module.exports = neuter;


function neuter(obj) {
  ab_neuter.neuter(ArrayBuffer.isView(obj) ? obj.buffer : obj);
}
