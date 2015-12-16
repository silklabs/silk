/**
 *  raygun.io integration for Browsers and React Native
 */
'use strict'

require('raygun4js'); // defines |window.Raygun|
var config = require('./config.raygun.json');

var enabled = false;

module.exports = {
  enable: function enable(appName, appVersion) {
    window.Raygun.init(config.apiKey, {
      debugMode: true,
      disableAnonymousUserTracking: true,
    })
    .setVersion(appVersion)
    .withTags(appName)
    .attach();

    window.Raygun.onBeforeSend(function (payload) {
      var stacktrace = payload.Details.Error.StackTrace;

      // Remove domain names for more concise backtraces
      var origin = window.location.origin;
      stacktrace.forEach(function (frame) {
        if (frame.FileName.startsWith(origin)) {
          frame.FileName = frame.FileName.slice(origin.length);
        }
      });
      return payload;
    });

    enabled = true;
  },

  send: function send(err) {
    if (enabled) {
      window.Raygun.send(err);
    }
  }
}

