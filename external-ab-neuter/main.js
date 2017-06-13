'use strict';

const release_type = process.config.target_defaults.default_configuration;
const ab_neuter = require(`./build/${release_type}/ab_neuter`);

module.exports = neuter;


function neuter(obj) {
  ab_neuter.neuter(ArrayBuffer.isView(obj) ? obj.buffer : obj);
}
