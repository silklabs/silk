var config = {
  apiKey: null,
  appId: null,
  externalAccessToken: null
};

try {
  config = require('./config.internal.json');
} catch (e) {};

module.exports = config;
