import { getprop } from './util';

var config = {};

// Check to see if server url should be overriden.
let serverUrl = getprop('persist.silk.server.url', null);
if (serverUrl) {
  config.serverUrl = serverUrl;
}
module.exports = require('silk-api')(config);
