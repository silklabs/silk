var config = {};
if (process.env.SILK_SERVER_URL) {
  config.serverUrl = process.env.SILK_SERVER_URL;
}
module.exports = require('silk-api')(config);
